import { pool } from '../../utils/db.js';
import { createWhatsAppMessageTemplate, listAllMessageTemplates } from './whatsappOfficialClient.js';
import { getAccountCredentials } from './whatsappOfficialConfigService.js';
import { isMetaAccessTokenExpiredGraphMessage, MetaAccessTokenExpiredError } from './whatsappOfficialMetaErrors.js';
import {
  buildCreateTemplateGraphBody,
  parseTemplateLanguageFromMeta,
  validateTemplatePayload,
  type CreateTemplatePayloadInput,
} from './whatsappOfficialTemplatePayload.js';

function componentsJson(raw: unknown): string {
  if (raw == null) return '[]';
  if (typeof raw === 'string') {
    try {
      JSON.parse(raw);
      return raw;
    } catch {
      return JSON.stringify(raw);
    }
  }
  return JSON.stringify(raw);
}

function qualityToString(q: unknown): string | null {
  if (q == null) return null;
  if (typeof q === 'string') return q;
  try {
    return JSON.stringify(q);
  } catch {
    return String(q);
  }
}

function normalizeMetaRejection(raw: Record<string, unknown>): string | null {
  const r = raw.rejected_reason ?? raw.rejection_reason ?? (raw as { reason?: string }).reason;
  if (r == null) return null;
  if (typeof r === 'string') return r;
  try {
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}

function normalizeGraphTemplateRow(raw: Record<string, unknown>): {
  meta_template_id: string | null;
  template_name: string;
  language: string;
  category: string | null;
  status: string | null;
  rejection_reason: string | null;
  quality_score: string | null;
  components: string;
} {
  const metaId = raw.id != null ? String(raw.id) : null;
  const name = String(raw.name ?? raw.id ?? '').trim();
  const language = parseTemplateLanguageFromMeta(raw);
  const category = typeof raw.category === 'string' ? raw.category : raw.category != null ? String(raw.category) : null;
  const status = typeof raw.status === 'string' ? raw.status : raw.status != null ? String(raw.status) : null;
  return {
    meta_template_id: metaId,
    template_name: name,
    language,
    category,
    status: status ? status.toUpperCase() : null,
    rejection_reason: normalizeMetaRejection(raw),
    quality_score: qualityToString(raw.quality_score),
    components: componentsJson(raw.components),
  };
}

export async function createTemplateOnMeta(
  accountId: string,
  input: CreateTemplatePayloadInput
): Promise<{ id: string; meta_template_id: string | null; status: string | null }> {
  const err = validateTemplatePayload(input);
  if (err) throw new Error(err);

  const cred = await getAccountCredentials(accountId);
  if (!cred) throw new Error('Conta não encontrada');
  const waba = cred.businessAccountId?.trim();
  if (!waba) throw new Error('WABA em falta na conta.');

  const graphBody = buildCreateTemplateGraphBody(input);
  const r = await createWhatsAppMessageTemplate(waba, cred.accessToken, graphBody);
  if (!r.ok) {
    const msg = r.error || 'Falha ao criar modelo na Meta';
    if (isMetaAccessTokenExpiredGraphMessage(msg)) throw new MetaAccessTokenExpiredError();
    throw new Error(msg);
  }

  const j = r.json as Record<string, unknown> | undefined;
  const metaId = j?.id != null ? String(j.id) : j?.hierarchical_id != null ? String(j.hierarchical_id) : null;
  const st = j?.message_template_id != null ? String(j.message_template_id) : null;
  const metaTemplateId = metaId ?? st;
  const status = j?.status != null ? String(j.status).toUpperCase() : 'PENDING';
  const category = j?.category != null ? String(j.category) : input.category;
  const rawPayload = JSON.stringify(j ?? {});

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO whatsapp_official_templates (
       account_id, template_name, language, category, status, components,
       meta_template_id, raw_payload, submitted_at, last_synced_at, quality_score, rejection_reason
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6::jsonb,
       $7, $8::jsonb, NOW(), NOW(), NULL, NULL
     )
     ON CONFLICT (account_id, template_name, language) DO UPDATE SET
       category = EXCLUDED.category,
       status = EXCLUDED.status,
       components = EXCLUDED.components,
       meta_template_id = COALESCE(EXCLUDED.meta_template_id, whatsapp_official_templates.meta_template_id),
       raw_payload = EXCLUDED.raw_payload,
       submitted_at = COALESCE(whatsapp_official_templates.submitted_at, EXCLUDED.submitted_at),
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING id::text`,
    [
      accountId,
      input.template_name_normalized.trim(),
      input.language.trim(),
      category,
      status,
      componentsJson((graphBody as { components?: unknown }).components),
      metaTemplateId,
      rawPayload,
    ]
  );

  return { id: ins.rows[0]!.id, meta_template_id: metaTemplateId, status };
}

export async function syncTemplatesFromMeta(accountId: string): Promise<{
  upserted: number;
  templates: unknown[];
  meta_received: number;
}> {
  const cred = await getAccountCredentials(accountId);
  if (!cred) throw new Error('Conta não encontrada');
  const waba = cred.businessAccountId?.trim();
  if (!waba) {
    throw new Error(
      'Indique o WhatsApp Business Account ID (WABA) nas definições da conexão oficial — é esse ID que a Meta usa em message_templates.'
    );
  }

  const r = await listAllMessageTemplates(waba, cred.accessToken);
  if (!r.ok) {
    const msg = r.error || 'Falha ao listar templates na Meta';
    if (isMetaAccessTokenExpiredGraphMessage(msg)) {
      throw new MetaAccessTokenExpiredError();
    }
    throw new Error(msg);
  }

  const rows = r.items ?? [];
  const meta_received = rows.length;
  let n = 0;
  for (const raw of rows) {
    const t = raw as Record<string, unknown>;
    const row = normalizeGraphTemplateRow(t);
    if (!row.template_name) continue;

    const st = row.status?.toUpperCase() ?? '';
    const apprIns = st === 'APPROVED' ? new Date() : null;
    const rejIns = st === 'REJECTED' || st === 'DISABLED' ? new Date() : null;

    await pool.query(
      `INSERT INTO whatsapp_official_templates (
         account_id, template_name, language, category, status, components,
         meta_template_id, rejection_reason, quality_score, raw_payload,
         last_synced_at, approved_at, rejected_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6::jsonb,
         $7, $8, $9, $10::jsonb,
         NOW(), $11, $12
       )
       ON CONFLICT (account_id, template_name, language) DO UPDATE SET
         category = EXCLUDED.category,
         status = EXCLUDED.status,
         components = EXCLUDED.components,
         meta_template_id = COALESCE(EXCLUDED.meta_template_id, whatsapp_official_templates.meta_template_id),
         rejection_reason = EXCLUDED.rejection_reason,
         quality_score = EXCLUDED.quality_score,
         raw_payload = EXCLUDED.raw_payload,
         last_synced_at = NOW(),
         approved_at = CASE
           WHEN EXCLUDED.status = 'APPROVED' THEN COALESCE(whatsapp_official_templates.approved_at, NOW())
           ELSE whatsapp_official_templates.approved_at
         END,
         rejected_at = CASE
           WHEN EXCLUDED.status IN ('REJECTED', 'DISABLED') THEN COALESCE(whatsapp_official_templates.rejected_at, NOW())
           ELSE whatsapp_official_templates.rejected_at
         END,
         updated_at = NOW()`,
      [
        accountId,
        row.template_name,
        row.language,
        row.category,
        row.status,
        row.components,
        row.meta_template_id,
        row.rejection_reason,
        row.quality_score,
        JSON.stringify(t),
        apprIns,
        rejIns,
      ]
    );
    n += 1;
  }

  const templates = await listTemplatesDb(accountId);
  return { upserted: n, templates, meta_received };
}

export async function listTemplatesDb(accountId: string): Promise<unknown[]> {
  const r = await pool.query(
    `SELECT id::text, template_name, language, category, status, components,
            meta_template_id, rejection_reason, quality_score,
            submitted_at::text, approved_at::text, rejected_at::text, last_synced_at::text,
            updated_at::text
     FROM whatsapp_official_templates
     WHERE account_id = $1::uuid
     ORDER BY template_name, language`,
    [accountId]
  );
  return r.rows;
}
