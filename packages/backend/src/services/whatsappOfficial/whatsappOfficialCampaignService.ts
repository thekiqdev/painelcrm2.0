import { pool } from '../../utils/db.js';
import { sendTemplateMessage } from './whatsappOfficialClient.js';
import { getAccountCredentials } from './whatsappOfficialConfigService.js';
import { normalizePhoneE164Digits } from './whatsappOfficialCampaignCsv.js';
import {
  buildGraphTemplateComponents,
  extractBodyPlaceholderIndices,
  type TemplateVariablesConfig,
} from './whatsappOfficialCampaignTemplateParams.js';
import { logCampaignAudit, logCampaignStructured } from './whatsappOfficialCampaignAudit.js';
import { parseCampaignCsv } from './whatsappOfficialCampaignCsv.js';
import {
  csvRowsToPayload,
  resolveTenantAudienceRows,
  type TenantAudienceFilters,
} from './whatsappOfficialCampaignAudienceService.js';

export type CampaignSendContext = {
  accountId: string;
  templateName: string;
  language: string;
  campaignStatus: string;
  templateVariables: unknown;
  staticTemplateComponents: unknown;
  templateComponentsFromDb: unknown;
};

function parseJsonArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadCampaignSendContext(campaignId: string): Promise<CampaignSendContext | null> {
  const r = await pool.query<{
    account_id: string;
    template_name: string;
    language: string;
    status: string;
    template_components: unknown;
    template_variables: unknown;
    tpl_components: unknown | null;
  }>(
    `SELECT c.account_id::text, c.template_name, c.language, c.status,
            c.template_components, c.template_variables,
            t.components AS tpl_components
     FROM whatsapp_official_campaigns c
     LEFT JOIN whatsapp_official_templates t
       ON t.account_id = c.account_id
      AND t.template_name = c.template_name
      AND t.language = c.language
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [campaignId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return {
    accountId: row.account_id,
    templateName: row.template_name,
    language: row.language,
    campaignStatus: row.status,
    templateVariables: row.template_variables,
    staticTemplateComponents: row.template_components,
    templateComponentsFromDb: row.tpl_components ?? row.template_components ?? [],
  };
}

function parseTemplateVariables(raw: unknown): TemplateVariablesConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as TemplateVariablesConfig;
}

export function mergeTemplateComponentsForPayload(
  ctx: CampaignSendContext,
  rawPayload: Record<string, unknown>
): unknown[] {
  const fromDb = parseJsonArray(ctx.templateComponentsFromDb);
  const placeholders = extractBodyPlaceholderIndices(fromDb.length ? fromDb : ctx.staticTemplateComponents);
  const tv = parseTemplateVariables(ctx.templateVariables);
  const dynamic = buildGraphTemplateComponents(placeholders, tv, rawPayload);
  if (dynamic.length > 0) return dynamic;
  return parseJsonArray(ctx.staticTemplateComponents);
}

export async function refreshCampaignAggregates(campaignId: string): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_official_campaigns SET
       total_recipients = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid),
       queued_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status IN ('queued', 'sending')),
       sent_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status = 'sent'),
       delivered_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status = 'delivered'),
       read_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status = 'read'),
       failed_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status = 'failed'),
       cancelled_count = (SELECT COUNT(*)::int FROM whatsapp_official_campaign_recipients WHERE campaign_id = $1::uuid AND status = 'cancelled'),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [campaignId]
  );
}

/** Falhas ainda elegíveis para retry não entram em failed_count agregado (mantêm fila “ativa”). */
export async function maybeCompleteCampaign(campaignId: string): Promise<boolean> {
  const u = await pool.query(
    `UPDATE whatsapp_official_campaigns SET
       status = 'completed',
       finished_at = NOW(),
       updated_at = NOW()
     WHERE id = $1::uuid AND status = 'running'
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_official_campaign_recipients r
         WHERE r.campaign_id = $1::uuid
           AND (
             r.status IN ('queued', 'sending')
             OR (r.status = 'failed' AND r.next_retry_at IS NOT NULL)
           )
       )
     RETURNING id`,
    [campaignId]
  );
  if (u.rowCount && u.rowCount > 0) {
    await logCampaignAudit({ campaignId, eventType: 'campaign_completed', payload: {} });
    logCampaignStructured('campaign_completed', { campaign_id: campaignId });
    return true;
  }
  return false;
}

export type RecipientInsertRow = {
  recipient_phone: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
  tenant_ref_id?: string | null;
  raw_payload: Record<string, unknown>;
  superadmin_lead_id?: string | null;
};

export async function insertCampaignRecipients(
  campaignId: string,
  rows: RecipientInsertRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let n = 0;
  for (const row of rows) {
    const ph = normalizePhoneE164Digits(row.recipient_phone);
    if (!ph) continue;
    await pool.query(
      `INSERT INTO whatsapp_official_campaign_recipients (
         campaign_id, recipient_phone, recipient_name, recipient_email, tenant_ref_id,
         raw_payload, superadmin_lead_id, status
       ) VALUES (
         $1::uuid, $2, $3, $4, $5::uuid, $6::jsonb, $7::uuid, 'queued'
       )`,
      [
        campaignId,
        ph,
        row.recipient_name ?? null,
        row.recipient_email ?? null,
        row.tenant_ref_id ?? null,
        JSON.stringify(row.raw_payload ?? {}),
        row.superadmin_lead_id ?? null,
      ]
    );
    n += 1;
  }
  await refreshCampaignAggregates(campaignId);
  return n;
}

export async function addRecipientsFromSuperadminLeadGroup(
  campaignId: string,
  leadGroupId: string
): Promise<{ count: number }> {
  const r = await pool.query<{
    lead_id: string;
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
  }>(
    `SELECT l.id::text, l.name, l.phone, l.email, l.company
     FROM superadmin_lead_group_members m
     INNER JOIN superadmin_leads l ON l.id = m.lead_id
     WHERE m.group_id = $1::uuid`,
    [leadGroupId]
  );
  const rows: RecipientInsertRow[] = [];
  const seen = new Set<string>();
  for (const row of r.rows) {
    const d = normalizePhoneE164Digits(row.phone || '');
    if (!d || seen.has(d)) continue;
    seen.add(d);
    rows.push({
      recipient_phone: d,
      recipient_name: row.name || null,
      recipient_email: row.email || null,
      raw_payload: {
        name: row.name,
        phone: d,
        email: row.email,
        company: row.company,
      },
      superadmin_lead_id: row.lead_id,
    });
  }
  const n = await insertCampaignRecipients(campaignId, rows);
  return { count: n };
}

export async function dispatchCampaign(campaignId: string): Promise<{
  sent: number;
  failed: number;
  error?: string;
}> {
  const ctx = await loadCampaignSendContext(campaignId);
  if (!ctx) return { sent: 0, failed: 0, error: 'Campanha não encontrada' };
  if (ctx.campaignStatus === 'completed') return { sent: 0, failed: 0, error: 'Já concluída' };

  const cred = await getAccountCredentials(ctx.accountId);
  if (!cred) return { sent: 0, failed: 0, error: 'Credenciais da conta em falta' };

  await pool.query(
    `UPDATE whatsapp_official_campaigns SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1::uuid`,
    [campaignId]
  );

  const recs = await pool.query<{
    id: string;
    recipient_phone: string;
    raw_payload: Record<string, unknown> | null;
  }>(
    `SELECT id::text, recipient_phone, raw_payload
     FROM whatsapp_official_campaign_recipients
     WHERE campaign_id = $1::uuid AND status = 'queued'`,
    [campaignId]
  );

  let sent = 0;
  let failed = 0;

  for (const rec of recs.rows) {
    if (!rec.recipient_phone) {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET status = 'failed', error_message = 'Sem telefone', failed_at = NOW() WHERE id = $1::uuid`,
        [rec.id]
      );
      failed += 1;
      continue;
    }
    const payload = (rec.raw_payload || {}) as Record<string, unknown>;
    const components = mergeTemplateComponentsForPayload(ctx, payload);
    const r = await sendTemplateMessage(
      cred.phoneNumberId,
      cred.accessToken,
      rec.recipient_phone,
      ctx.templateName,
      ctx.language,
      components
    );
    if (r.ok && r.messages?.[0]?.id) {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET
           status = 'sent', provider_message_id = $2, sent_at = NOW(), template_params = $3::jsonb
         WHERE id = $1::uuid`,
        [rec.id, r.messages[0].id, JSON.stringify(components)]
      );
      sent += 1;
    } else {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET
           status = 'failed', error_message = $2, failed_at = NOW()
         WHERE id = $1::uuid`,
        [rec.id, (r.error || 'send failed').slice(0, 500)]
      );
      failed += 1;
    }
    await new Promise((res) => setTimeout(res, 150));
  }

  await pool.query(
    `UPDATE whatsapp_official_campaigns SET
       status = 'completed',
       finished_at = NOW(),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [campaignId]
  );
  await refreshCampaignAggregates(campaignId);

  return { sent, failed };
}

export async function sendCampaignTestTemplate(params: {
  accountId: string;
  templateName: string;
  language: string;
  toPhoneRaw: string;
  templateVariables: unknown;
  samplePayload: Record<string, unknown>;
  staticTemplateComponents?: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  const cred = await getAccountCredentials(params.accountId);
  if (!cred) return { ok: false, error: 'Credenciais da conta em falta' };
  const to = normalizePhoneE164Digits(params.toPhoneRaw);
  if (!to) return { ok: false, error: 'Telefone inválido' };

  const tpl = await pool.query<{ components: unknown }>(
    `SELECT components FROM whatsapp_official_templates
     WHERE account_id = $1::uuid AND template_name = $2 AND language = $3 LIMIT 1`,
    [params.accountId, params.templateName, params.language]
  );
  const ctx: CampaignSendContext = {
    accountId: params.accountId,
    templateName: params.templateName,
    language: params.language,
    campaignStatus: 'draft',
    templateVariables: params.templateVariables,
    staticTemplateComponents: params.staticTemplateComponents ?? [],
    templateComponentsFromDb: tpl.rows[0]?.components ?? [],
  };
  const components = mergeTemplateComponentsForPayload(ctx, params.samplePayload);
  const r = await sendTemplateMessage(
    cred.phoneNumberId,
    cred.accessToken,
    to,
    params.templateName,
    params.language,
    components
  );
  if (!r.ok) return { ok: false, error: r.error || 'Falha no envio de teste' };
  return { ok: true };
}

export async function previewAudienceResolution(params: {
  audience_type: 'superadmin_lead_group' | 'csv' | 'tenants';
  audience_group_id?: string;
  csv_text?: string;
  tenant_filters?: TenantAudienceFilters;
}): Promise<{ total: number; sample: Record<string, unknown>[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (params.audience_type === 'superadmin_lead_group') {
    if (!params.audience_group_id) {
      return { total: 0, sample: [], warnings: ['Grupo não informado'] };
    }
    const r = await pool.query<{
      name: string;
      phone: string | null;
      email: string | null;
    }>(
      `SELECT l.name, l.phone, l.email
       FROM superadmin_lead_group_members m
       INNER JOIN superadmin_leads l ON l.id = m.lead_id
       WHERE m.group_id = $1::uuid`,
      [params.audience_group_id]
    );
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      const d = normalizePhoneE164Digits(row.phone || '');
      if (!d) {
        warnings.push(`Lead sem telefone válido: ${row.name}`);
        continue;
      }
      if (seen.has(d)) continue;
      seen.add(d);
      rows.push({ name: row.name, phone: d, email: row.email });
    }
    return {
      total: rows.length,
      sample: rows.slice(0, 5).map((x) => x),
      warnings,
    };
  }
  if (params.audience_type === 'csv') {
    const parsed = parseCampaignCsv(params.csv_text || '');
    warnings.push(...parsed.errors);
    const mapped = csvRowsToPayload(parsed.rows);
    return {
      total: mapped.length,
      sample: mapped.slice(0, 5).map((m) => ({ ...m.raw_payload, phone: m.phone_digits })),
      warnings,
    };
  }
  const tenants = await resolveTenantAudienceRows(params.tenant_filters ?? {});
  return {
    total: tenants.length,
    sample: tenants.slice(0, 5).map((t) => ({ ...t.raw_payload, phone: t.phone_digits })),
    warnings,
  };
}

export async function startCampaign(campaignId: string, createdBy: string | null): Promise<{ ok: boolean; error?: string }> {
  const u = await pool.query(
    `UPDATE whatsapp_official_campaigns SET
       status = 'running',
       started_at = COALESCE(started_at, NOW()),
       paused_at = NULL,
       updated_at = NOW()
     WHERE id = $1::uuid
       AND status IN ('draft', 'paused', 'scheduled')
     RETURNING id`,
    [campaignId]
  );
  if (!u.rowCount) {
    return { ok: false, error: 'Campanha não pode ser iniciada (estado ou agendamento)' };
  }
  await refreshCampaignAggregates(campaignId);
  await logCampaignAudit({
    campaignId,
    eventType: 'campaign_send_started',
    payload: {},
    createdBy,
  });
  logCampaignStructured('campaign_send_started', { campaign_id: campaignId });
  return { ok: true };
}

export async function pauseCampaign(campaignId: string, createdBy: string | null): Promise<{ ok: boolean }> {
  await pool.query(
    `UPDATE whatsapp_official_campaigns SET status = 'paused', paused_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status = 'running'`,
    [campaignId]
  );
  await logCampaignAudit({ campaignId, eventType: 'campaign_paused', payload: {}, createdBy });
  return { ok: true };
}

export async function resumeCampaign(campaignId: string, createdBy: string | null): Promise<{ ok: boolean }> {
  await pool.query(
    `UPDATE whatsapp_official_campaigns SET status = 'running', paused_at = NULL, updated_at = NOW()
     WHERE id = $1::uuid AND status = 'paused'`,
    [campaignId]
  );
  await logCampaignAudit({ campaignId, eventType: 'campaign_resumed', payload: {}, createdBy });
  return { ok: true };
}

export async function cancelCampaign(campaignId: string, createdBy: string | null): Promise<{ ok: boolean }> {
  await pool.query(
    `UPDATE whatsapp_official_campaigns SET status = 'cancelled', finished_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status NOT IN ('completed', 'cancelled')`,
    [campaignId]
  );
  await pool.query(
    `UPDATE whatsapp_official_campaign_recipients SET status = 'cancelled'
     WHERE campaign_id = $1::uuid AND status IN ('queued', 'failed')`,
    [campaignId]
  );
  await refreshCampaignAggregates(campaignId);
  await logCampaignAudit({ campaignId, eventType: 'campaign_cancelled', payload: {}, createdBy });
  return { ok: true };
}

export async function retryFailedRecipients(campaignId: string): Promise<{ reset: number }> {
  const r = await pool.query(
    `UPDATE whatsapp_official_campaign_recipients SET
       status = 'queued',
       attempt_count = 0,
       next_retry_at = NULL,
       error_message = NULL,
       failed_at = NULL,
       error_code = NULL
     WHERE campaign_id = $1::uuid AND status = 'failed' AND next_retry_at IS NULL`,
    [campaignId]
  );
  await refreshCampaignAggregates(campaignId);
  return { reset: r.rowCount ?? 0 };
}
