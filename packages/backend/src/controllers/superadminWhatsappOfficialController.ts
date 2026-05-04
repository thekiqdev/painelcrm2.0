import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { isWhatsappOfficialSuperadminEnabled } from '../config/whatsappOfficialEnv.js';
import { validateAccessToken } from '../services/whatsappOfficial/whatsappOfficialClient.js';
import {
  getSuperadminAccount,
  getAccountCredentials,
  upsertSuperadminAccount,
  updateAccountStatus,
  WhatsappOfficialAccountUpsertValidationError,
} from '../services/whatsappOfficial/whatsappOfficialConfigService.js';
import { isWhatsappOfficialEncryptionConfigured } from '../services/whatsappOfficial/whatsappOfficialSecretCrypto.js';
import {
  createTemplateOnMeta,
  syncTemplatesFromMeta,
  listTemplatesDb,
} from '../services/whatsappOfficial/whatsappOfficialTemplateService.js';
import { normalizeTemplateName } from '../services/whatsappOfficial/whatsappOfficialTemplatePayload.js';
import type { CreateTemplatePayloadInput, WaTemplateButtonInput } from '../services/whatsappOfficial/whatsappOfficialTemplatePayload.js';
import { MetaAccessTokenExpiredError } from '../services/whatsappOfficial/whatsappOfficialMetaErrors.js';
import {
  addRecipientsFromSuperadminLeadGroup,
  dispatchCampaign,
  insertCampaignRecipients,
  previewAudienceResolution,
  sendCampaignTestTemplate,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  retryFailedRecipients,
} from '../services/whatsappOfficial/whatsappOfficialCampaignService.js';
import { csvRowsToPayload, resolveTenantAudienceRows } from '../services/whatsappOfficial/whatsappOfficialCampaignAudienceService.js';
import { parseCampaignCsv } from '../services/whatsappOfficial/whatsappOfficialCampaignCsv.js';
import { logCampaignAudit } from '../services/whatsappOfficial/whatsappOfficialCampaignAudit.js';
import { sendOfficialTextAndPersist } from '../services/whatsappOfficial/whatsappOfficialMessageService.js';

function formatZodAccountPutError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.length ? i.path.join('.') : 'body'}: ${i.message}`).join('; ');
}

/** Campos sensíveis vazios numa conta já existente mantêm o valor guardado (o UI não repõe tokens). */
const accountPutSchema = z.object({
  business_account_id: z.preprocess(
    (v) => (v == null ? '' : String(v)).trim(),
    z.string().min(1, 'Indique o WhatsApp Business Account ID (WABA).'),
  ),
  phone_number_id: z.preprocess(
    (v) => (v == null ? '' : String(v)).trim(),
    z.string().min(1, 'Indique o Phone number ID.'),
  ),
  access_token: z.preprocess((v) => (v == null ? '' : String(v)).trim(), z.string()),
  webhook_verify_token: z.preprocess((v) => (v == null ? '' : String(v)).trim(), z.string()),
  app_id: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? null : String(v).trim()),
    z.union([z.string(), z.null()]).optional(),
  ),
  app_secret: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? null : String(v)),
    z.union([z.string(), z.null()]).optional(),
  ),
});

/** `access_token` vazio: usa o token já cifrado na conta (teste sem colar de novo). */
const validateBodySchema = z.object({
  access_token: z.preprocess((v) => (v == null ? '' : String(v)).trim(), z.string()),
  phone_number_id: z.preprocess(
    (v) => (v == null ? '' : String(v)).trim(),
    z.string().min(1, 'Indique o Phone number ID.'),
  ),
});

const tenantFiltersSchema = z.object({
  active_only: z.boolean().optional(),
  plan_ids: z.array(z.string().uuid()).optional(),
  statuses: z.array(z.enum(['active', 'trial', 'suspended', 'overdue'])).optional(),
  created_from: z.string().optional().nullable(),
  created_to: z.string().optional().nullable(),
});

const campaignCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    template_name: z.string().min(1),
    language: z.string().default('pt_BR'),
    audience_type: z.enum(['superadmin_lead_group', 'csv', 'tenants']),
    audience_group_id: z.string().uuid().optional().nullable(),
    csv_text: z.string().optional().nullable(),
    tenant_filters: tenantFiltersSchema.optional().nullable(),
    template_components: z.array(z.unknown()).optional(),
    template_variables: z.any().optional(),
    send_mode: z.enum(['immediate', 'scheduled']).optional(),
    scheduled_at: z.string().optional().nullable(),
    audience_config: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.audience_type === 'superadmin_lead_group' && !data.audience_group_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'audience_group_id obrigatório para grupo de leads',
        path: ['audience_group_id'],
      });
    }
    if (data.audience_type === 'csv' && (!data.csv_text || data.csv_text.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'csv_text obrigatório',
        path: ['csv_text'],
      });
    }
  });

const campaignTestSendSchema = z.object({
  to_phone: z.string().min(8),
  template_name: z.string().min(1),
  language: z.string().default('pt_BR'),
  template_variables: z.any().optional(),
  sample_payload: z.record(z.string(), z.any()).optional(),
});

const previewAudienceSchema = z.object({
  audience_type: z.enum(['superadmin_lead_group', 'csv', 'tenants']),
  audience_group_id: z.string().uuid().optional().nullable(),
  csv_text: z.string().optional().nullable(),
  tenant_filters: tenantFiltersSchema.optional().nullable(),
});

const importCsvSchema = z.object({
  csv_text: z.string().min(1),
});

const waTemplateButtonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal('URL'), text: z.string().min(1).max(25), url: z.string().min(1) }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().min(1).max(25),
    phone_number: z.string().min(3),
  }),
]);

const createWaTemplateSchema = z.object({
  accountId: z.string().uuid().optional(),
  name: z.string().min(1, 'Nome obrigatório'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().min(1),
  header_type: z.enum(['NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO']),
  header_text: z.string().optional(),
  header_media_handle: z.string().optional(),
  body: z.string().min(1),
  footer: z.string().optional(),
  buttons: z.array(waTemplateButtonSchema).max(10).default([]),
  variable_examples: z.record(z.string(), z.string()).default({}),
});

const sendTextSchema = z.object({
  to_phone: z.string().min(8),
  text: z.string().min(1).max(4096),
});

function gate(res: Response): boolean {
  if (!isWhatsappOfficialSuperadminEnabled()) {
    res.status(403).json({ error: 'WhatsApp oficial (Super Admin) desativado neste ambiente.' });
    return false;
  }
  return true;
}

export async function getWhatsappOfficialAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const { account } = await getSuperadminAccount();
    res.json({
      account,
      encryption_configured: isWhatsappOfficialEncryptionConfigured(),
    });
  } catch (e) {
    console.error('[wa-official] get account', e);
    res.status(500).json({ error: 'Erro ao carregar conta' });
  }
}

export async function putWhatsappOfficialAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const uid = req.userId;
    if (!uid) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const parsed = accountPutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: formatZodAccountPutError(parsed.error), issues: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const { id, plainAccessTokenForValidation, webhook_verify_token_generated } = await upsertSuperadminAccount({
      business_account_id: body.business_account_id,
      phone_number_id: body.phone_number_id,
      access_token: body.access_token,
      webhook_verify_token: body.webhook_verify_token,
      app_id: body.app_id ?? null,
      app_secret: body.app_secret ?? null,
      inbox_user_id: uid,
    });
    let tokenForValidation = plainAccessTokenForValidation ?? '';
    if (!tokenForValidation) {
      const creds = await getAccountCredentials(id);
      tokenForValidation = creds?.accessToken ?? '';
    }
    if (!tokenForValidation) {
      res.status(400).json({
        error:
          'Não foi possível obter o access token para validar com a Meta. Cole o token (primeira configuração ou substituição).',
      });
      return;
    }
    const val = await validateAccessToken(tokenForValidation, body.phone_number_id);
    if (val.ok) {
      await updateAccountStatus(id, 'connected', {
        display_phone: val.display_phone_number,
        verified: val.verified_name,
      });
    } else {
      await updateAccountStatus(id, 'error');
    }
    res.json({
      id,
      validation: val.ok ? 'connected' : 'error',
      graph_error: val.error ?? null,
      ...(webhook_verify_token_generated ? { webhook_verify_token_generated } : {}),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: formatZodAccountPutError(e), issues: e.flatten() });
      return;
    }
    if (e instanceof WhatsappOfficialAccountUpsertValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('[wa-official] put account', e);
    res.status(500).json({ error: 'Erro ao guardar conta' });
  }
}

export async function postWhatsappOfficialValidate(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const parsed = validateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: formatZodAccountPutError(parsed.error) });
      return;
    }
    const body = parsed.data;
    let token = body.access_token;
    if (!token) {
      const { account } = await getSuperadminAccount();
      if (account?.id) {
        const creds = await getAccountCredentials(account.id);
        token = creds?.accessToken ?? '';
      }
    }
    if (!token) {
      res.status(400).json({
        ok: false,
        error: 'Cole o access token no formulário ou guarde credenciais antes de testar.',
      });
      return;
    }
    const val = await validateAccessToken(token, body.phone_number_id);
    if (!val.ok) {
      res.status(400).json({ ok: false, error: val.error ?? 'Falha na API Meta' });
      return;
    }
    res.json({
      ok: true,
      display_phone_number: val.display_phone_number,
      verified_name: val.verified_name,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: formatZodAccountPutError(e) });
      return;
    }
    console.error('[wa-official] validate', e);
    res.status(500).json({ error: 'Erro na validação' });
  }
}

export async function postWhatsappOfficialTemplatesSync(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const r = await syncTemplatesFromMeta(acc.account.id);
    res.json(r);
  } catch (e) {
    if (e instanceof MetaAccessTokenExpiredError) {
      res.status(401).json({ error: e.message, code: e.code });
      return;
    }
    console.error('[wa-official] sync templates', e);
    res.status(500).json({ error: String((e as Error).message || 'Erro ao sincronizar') });
  }
}

export async function postWhatsappOfficialTemplatesCreate(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const parsed = createWaTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: formatZodAccountPutError(parsed.error), issues: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta WhatsApp Oficial primeiro.' });
      return;
    }
    if (body.accountId && body.accountId !== acc.account.id) {
      res.status(400).json({ error: 'accountId não corresponde à conta Super Admin.' });
      return;
    }
    if (acc.account.status !== 'connected') {
      res.status(400).json({
        error: 'A conta WhatsApp Oficial tem de estar ligada (estado «connected») antes de criar modelos.',
      });
      return;
    }

    const normalized = normalizeTemplateName(body.name);
    if (!normalized) {
      res.status(400).json({ error: 'Nome inválido após normalização (use letras, números e _).' });
      return;
    }

    const input: CreateTemplatePayloadInput = {
      template_name_normalized: normalized,
      category: body.category,
      language: body.language.trim(),
      header_type: body.header_type,
      header_text: body.header_text,
      header_media_handle: body.header_media_handle,
      body: body.body,
      footer: body.footer,
      buttons: body.buttons as WaTemplateButtonInput[],
      variable_examples: body.variable_examples,
    };

    const r = await createTemplateOnMeta(acc.account.id, input);
    res.status(201).json(r);
  } catch (e) {
    if (e instanceof MetaAccessTokenExpiredError) {
      res.status(401).json({ error: e.message, code: e.code });
      return;
    }
    console.error('[wa-official] create template', e);
    res.status(400).json({ error: String((e as Error).message || 'Erro ao criar modelo') });
  }
}

export async function getWhatsappOfficialTemplates(_req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.json([]);
      return;
    }
    const rows = await listTemplatesDb(acc.account.id);
    res.json(rows);
  } catch (e) {
    console.error('[wa-official] list templates', e);
    res.status(500).json({ error: 'Erro ao listar templates' });
  }
}

export async function getWhatsappOfficialCampaigns(_req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.json([]);
      return;
    }
    const r = await pool.query(
      `SELECT id::text, name, audience_type, template_name, language, status,
              sent_count, failed_count, total_recipients, queued_count, delivered_count, read_count, cancelled_count,
              send_mode, scheduled_at::text, started_at::text, finished_at::text, paused_at::text,
              created_at::text, updated_at::text
       FROM whatsapp_official_campaigns
       WHERE account_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 100`,
      [acc.account.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[wa-official] campaigns', e);
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
}

export async function postWhatsappOfficialCampaign(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const body = campaignCreateSchema.parse(req.body);
    const uid = req.userId ?? null;

    let initialStatus = 'draft';
    if (body.send_mode === 'scheduled' && body.scheduled_at) {
      initialStatus = 'scheduled';
    }

    const mergedAudienceConfig = {
      ...(body.audience_config ?? {}),
      audience_type: body.audience_type,
      audience_group_id: body.audience_group_id ?? null,
      tenant_filters: body.tenant_filters ?? null,
    };

    const ins = await pool.query<{ id: string }>(
      `INSERT INTO whatsapp_official_campaigns (
         account_id, tenant_id, name, audience_type, template_name, language,
         template_components, template_variables, audience_config,
         send_mode, scheduled_at, status, created_by
       ) VALUES (
         $1::uuid, NULL, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
         COALESCE($9::text, 'immediate'),
         $10::timestamptz,
         $11::text,
         $12::uuid
       ) RETURNING id::text`,
      [
        acc.account.id,
        body.name,
        body.audience_type,
        body.template_name,
        body.language,
        JSON.stringify(body.template_components ?? []),
        JSON.stringify(body.template_variables ?? {}),
        JSON.stringify(mergedAudienceConfig),
        body.send_mode ?? null,
        body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null,
        initialStatus,
        uid,
      ]
    );
    const campaignId = ins.rows[0]!.id;

    try {
      if (body.audience_type === 'superadmin_lead_group' && body.audience_group_id) {
        await addRecipientsFromSuperadminLeadGroup(campaignId, body.audience_group_id);
      } else if (body.audience_type === 'csv' && body.csv_text) {
        const parsed = parseCampaignCsv(body.csv_text);
        const mapped = csvRowsToPayload(parsed.rows);
        await insertCampaignRecipients(
          campaignId,
          mapped.map((m) => ({
            recipient_phone: m.phone_digits,
            recipient_name: m.tenant_name,
            recipient_email: (m.raw_payload.email as string) || null,
            tenant_ref_id: null,
            raw_payload: m.raw_payload,
          }))
        );
      } else if (body.audience_type === 'tenants') {
        const tenants = await resolveTenantAudienceRows(body.tenant_filters ?? {});
        await insertCampaignRecipients(
          campaignId,
          tenants.map((t) => ({
            recipient_phone: t.phone_digits,
            recipient_name: t.tenant_name,
            tenant_ref_id: t.tenant_id || null,
            raw_payload: t.raw_payload,
          }))
        );
      }
    } catch (audErr) {
      console.error('[wa-official] audience insert rollback candidate', audErr);
      await pool.query(`DELETE FROM whatsapp_official_campaigns WHERE id = $1::uuid`, [campaignId]);
      throw audErr;
    }

    await logCampaignAudit({
      campaignId,
      eventType: 'campaign_created',
      payload: { audience_type: body.audience_type },
      createdBy: uid,
    });

    res.status(201).json({ id: campaignId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[wa-official] create campaign', e);
    res.status(500).json({ error: 'Erro ao criar campanha' });
  }
}

export async function postWhatsappOfficialCampaignDispatch(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await dispatchCampaign(id);
    res.json(r);
  } catch (e) {
    console.error('[wa-official] dispatch', e);
    res.status(500).json({ error: String((e as Error).message || 'Erro no disparo') });
  }
}

export async function getWhatsappOfficialConversations(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const uid = req.userId;
    if (!uid) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const r = await pool.query(
      `SELECT c.id::text, c.external_chat_id, c.phone_number, c.last_message_preview,
              c.last_message_at::text, c.unread_count, c.updated_at::text
       FROM chat_conversations c
       INNER JOIN whatsapp_official_accounts a ON a.id = c.whatsapp_official_account_id
       WHERE c.whatsapp_official_account_id IS NOT NULL
         AND a.owner_scope = 'superadmin'
         AND (a.inbox_user_id = $1::uuid OR a.inbox_user_id IS NULL)
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 200`,
      [uid]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[wa-official] conversations', e);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
}

export async function postWhatsappOfficialSendText(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const uid = req.userId;
    if (!uid) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const body = sendTextSchema.parse(req.body);
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const r = await sendOfficialTextAndPersist({
      accountId: acc.account.id,
      inboxUserId: uid,
      toPhoneDigits: body.to_phone,
      text: body.text,
    });
    if (!r.ok) {
      res.status(400).json({ error: r.error || 'Falha no envio' });
      return;
    }
    res.json({ ok: true, wamid: r.wamid });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[wa-official] send text', e);
    res.status(500).json({ error: 'Erro ao enviar' });
  }
}

export async function getWhatsappOfficialCampaignById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const st = typeof req.query.recipient_status === 'string' ? req.query.recipient_status : null;
    const c = await pool.query(
      `SELECT id::text, name, audience_type, template_name, language, status,
              template_components, template_variables, audience_config,
              sent_count, failed_count, total_recipients, queued_count, delivered_count, read_count, cancelled_count,
              send_mode, scheduled_at::text, started_at::text, finished_at::text, paused_at::text,
              created_at::text, updated_at::text
       FROM whatsapp_official_campaigns
       WHERE id = $1::uuid AND account_id = $2::uuid
       LIMIT 1`,
      [id, acc.account.id]
    );
    if (c.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    const params: unknown[] = [id];
    let sql = `SELECT id::text, recipient_phone, recipient_name, recipient_email, status,
                       provider_message_id, error_message, error_code,
                       sent_at::text, delivered_at::text, read_at::text, failed_at::text,
                       attempt_count, next_retry_at::text, created_at::text
                FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid`;
    if (st) {
      sql += ` AND status = $2::text`;
      params.push(st);
    }
    sql += ` ORDER BY created_at ASC LIMIT 5000`;
    const rec = await pool.query(sql, params);
    res.json({ campaign: c.rows[0], recipients: rec.rows });
  } catch (e) {
    console.error('[wa-official] campaign detail', e);
    res.status(500).json({ error: 'Erro ao carregar campanha' });
  }
}

export async function getWhatsappOfficialCampaignExport(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const ok = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid LIMIT 1`,
      [id, acc.account.id]
    );
    if (ok.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    const r = await pool.query<{
      recipient_phone: string;
      recipient_name: string | null;
      recipient_email: string | null;
      status: string;
      error_message: string | null;
      sent_at: Date | null;
      delivered_at: Date | null;
      read_at: Date | null;
    }>(
      `SELECT recipient_phone, recipient_name, recipient_email, status, error_message,
              sent_at, delivered_at, read_at
       FROM whatsapp_official_campaign_recipients
       WHERE campaign_id = $1::uuid
       ORDER BY created_at ASC`,
      [id]
    );
    const esc = (v: string | null | undefined) => {
      const s = v ?? '';
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header =
      'telefone,nome,email,status,erro,enviado_em,entregue_em,lido_em\n';
    const lines = r.rows.map(
      (row) =>
        [
          esc(row.recipient_phone),
          esc(row.recipient_name),
          esc(row.recipient_email),
          esc(row.status),
          esc(row.error_message),
          row.sent_at ? esc(row.sent_at.toISOString()) : '',
          row.delivered_at ? esc(row.delivered_at.toISOString()) : '',
          row.read_at ? esc(row.read_at.toISOString()) : '',
        ].join(',') + '\n'
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campanha-${id}.csv"`);
    res.send(header + lines.join(''));
  } catch (e) {
    console.error('[wa-official] export campaign', e);
    res.status(500).json({ error: 'Erro ao exportar' });
  }
}

export async function postWhatsappOfficialCampaignStart(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const own = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid`,
      [id, acc.account.id]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    const r = await startCampaign(id, req.userId ?? null);
    if (!r.ok) {
      res.status(400).json({ error: r.error || 'Não foi possível iniciar' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-official] campaign start', e);
    res.status(500).json({ error: 'Erro ao iniciar' });
  }
}

export async function postWhatsappOfficialCampaignPause(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const own = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid`,
      [id, acc.account.id]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    await pauseCampaign(id, req.userId ?? null);
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-official] campaign pause', e);
    res.status(500).json({ error: 'Erro ao pausar' });
  }
}

export async function postWhatsappOfficialCampaignResume(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const own = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid`,
      [id, acc.account.id]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    await resumeCampaign(id, req.userId ?? null);
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-official] campaign resume', e);
    res.status(500).json({ error: 'Erro ao retomar' });
  }
}

export async function postWhatsappOfficialCampaignCancel(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const own = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid`,
      [id, acc.account.id]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    await cancelCampaign(id, req.userId ?? null);
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-official] campaign cancel', e);
    res.status(500).json({ error: 'Erro ao cancelar' });
  }
}

export async function postWhatsappOfficialCampaignRetryFailed(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const own = await pool.query(
      `SELECT 1 FROM whatsapp_official_campaigns WHERE id = $1::uuid AND account_id = $2::uuid`,
      [id, acc.account.id]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Campanha não encontrada' });
      return;
    }
    const r = await retryFailedRecipients(id);
    res.json(r);
  } catch (e) {
    console.error('[wa-official] campaign retry', e);
    res.status(500).json({ error: 'Erro ao reprocessar falhas' });
  }
}

export async function postWhatsappOfficialCampaignTestSend(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const acc = await getSuperadminAccount();
    if (!acc.account?.id) {
      res.status(400).json({ error: 'Configure a conta primeiro.' });
      return;
    }
    const body = campaignTestSendSchema.parse(req.body);
    const r = await sendCampaignTestTemplate({
      accountId: acc.account.id,
      templateName: body.template_name,
      language: body.language,
      toPhoneRaw: body.to_phone,
      templateVariables: body.template_variables ?? {},
      samplePayload: body.sample_payload ?? {},
    });
    if (!r.ok) {
      res.status(400).json({ error: r.error || 'Falha no envio de teste' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[wa-official] campaign test send', e);
    res.status(500).json({ error: 'Erro no envio de teste' });
  }
}

export async function postWhatsappOfficialCampaignPreviewAudience(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const body = previewAudienceSchema.parse(req.body);
    const r = await previewAudienceResolution({
      audience_type: body.audience_type,
      audience_group_id: body.audience_group_id ?? undefined,
      csv_text: body.csv_text ?? undefined,
      tenant_filters: body.tenant_filters ?? undefined,
    });
    res.json(r);
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[wa-official] preview audience', e);
    res.status(500).json({ error: 'Erro na pré-visualização' });
  }
}

export async function postWhatsappOfficialCampaignImportCsv(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!gate(res)) return;
    const body = importCsvSchema.parse(req.body);
    const parsed = parseCampaignCsv(body.csv_text);
    res.json({
      row_count: parsed.rows.length,
      errors: parsed.errors,
      preview: parsed.rows.slice(0, 15),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[wa-official] import csv preview', e);
    res.status(500).json({ error: 'Erro ao processar CSV' });
  }
}
