import { pool } from '../utils/db.js';
import type { AcquisitionLeadRow, AcquisitionLeadStage, ActivationScore } from './acquisitionTypes.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import {
  hasRealAcquisitionLeadName,
  isAcquisitionCaptureNamePlaceholder,
  normalizeCaptureNameForStorage,
} from './acquisitionCapturePlaceholder.js';

let tableExistsCache: boolean | undefined;

export async function acquisitionLeadsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'acquisition_leads'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

function mapRow(row: Record<string, unknown>): AcquisitionLeadRow {
  return {
    id: String(row.id),
    name: row.name != null ? String(row.name) : null,
    email: String(row.email),
    phone: row.phone != null ? String(row.phone) : null,
    source: row.source != null ? String(row.source) : null,
    campaign: row.campaign != null ? String(row.campaign) : null,
    utm_json: (row.utm_json ?? {}) as Record<string, unknown>,
    selected_plan_id: row.selected_plan_id != null ? String(row.selected_plan_id) : null,
    current_stage: row.current_stage as AcquisitionLeadStage,
    activation_score: row.activation_score as ActivationScore,
    abandoned_at: row.abandoned_at != null ? String(row.abandoned_at) : null,
    converted_at: row.converted_at != null ? String(row.converted_at) : null,
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    correlation_id: String(row.correlation_id),
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function findAcquisitionLeadByEmail(email: string): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const em = normalizeEmailForUniqueness(email);
  const r = await pool.query(`SELECT * FROM acquisition_leads WHERE lower(trim(email)) = $1 ORDER BY updated_at DESC LIMIT 1`, [
    em,
  ]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function findAcquisitionLeadByPhone(phoneDigits: string): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const digits = phoneDigits.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const r = await pool.query(
    `SELECT * FROM acquisition_leads
     WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [digits],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Substitui e-mail placeholder (captura por telefone) pelo e-mail real do usuário. */
export async function finalizeAcquisitionLeadEmail(
  leadId: string,
  email: string,
  correlationId: string,
): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const em = normalizeEmailForUniqueness(email);
  const r = await pool.query(
    `UPDATE acquisition_leads
     SET email = $2,
         correlation_id = $3,
         metadata_json = metadata_json || $4::jsonb,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      leadId,
      em,
      correlationId,
      JSON.stringify({ email_confirmed_at: new Date().toISOString() }),
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function insertAcquisitionLead(input: {
  name?: string | null;
  email: string;
  phone?: string | null;
  source?: string | null;
  campaign?: string | null;
  utm?: Record<string, unknown>;
  selectedPlanId?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
  stage?: AcquisitionLeadStage;
}): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;

  const r = await pool.query(
    `INSERT INTO acquisition_leads (
       name, email, phone, source, campaign, utm_json, selected_plan_id,
       current_stage, correlation_id, metadata_json, updated_at
     ) VALUES ($1, lower(trim($2)), $3, $4, $5, $6::jsonb, $7, $8::acquisition_lead_stage, $9, $10::jsonb, now())
     RETURNING *`,
    [
      input.name ?? null,
      input.email,
      input.phone ?? null,
      input.source ?? null,
      input.campaign ?? null,
      JSON.stringify(input.utm ?? {}),
      input.selectedPlanId ?? null,
      input.stage ?? 'pre_signup',
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Reutiliza lead por e-mail — atualiza contato e último acesso. */
function resolveUpsertLeadName(
  existingName: string | null | undefined,
  inputName?: string | null,
): string | null {
  const incoming = inputName?.trim() ?? null;
  if (!incoming) {
    return existingName?.trim() ? existingName.trim() : null;
  }
  if (isAcquisitionCaptureNamePlaceholder(incoming)) {
    return hasRealAcquisitionLeadName(existingName) ? existingName!.trim() : null;
  }
  return incoming;
}

export async function upsertAcquisitionLeadContact(input: {
  name?: string | null;
  email: string;
  phone?: string | null;
  source?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
  stage?: AcquisitionLeadStage;
}): Promise<AcquisitionLeadRow | null> {
  const existing = await findAcquisitionLeadByEmail(input.email);
  if (!existing) {
    return insertAcquisitionLead({
      ...input,
      name: normalizeCaptureNameForStorage(input.name ?? '') ?? input.name ?? null,
      stage: input.stage ?? 'contact_captured',
    });
  }

  const mergedMeta = {
    ...existing.metadata_json,
    ...input.metadata,
    last_seen_at: new Date().toISOString(),
    resumed: true,
  };

  const nameForUpdate = resolveUpsertLeadName(existing.name, input.name);

  const r = await pool.query(
    `UPDATE acquisition_leads
     SET name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         source = COALESCE($4, source),
         metadata_json = metadata_json || $5::jsonb,
         current_stage = COALESCE($6::acquisition_lead_stage, current_stage),
         correlation_id = $7,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      existing.id,
      nameForUpdate,
      input.phone ?? null,
      input.source ?? null,
      JSON.stringify(mergedMeta),
      input.stage ?? null,
      input.correlationId,
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : existing;
}

export async function mergeAcquisitionLeadMetadata(
  leadId: string,
  patch: Record<string, unknown>,
): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const r = await pool.query(
    `UPDATE acquisition_leads
     SET metadata_json = metadata_json || $2::jsonb, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [leadId, JSON.stringify(patch)],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function findAcquisitionLeadById(id: string): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const r = await pool.query(`SELECT * FROM acquisition_leads WHERE id = $1`, [id]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function updateAcquisitionLeadActivationScore(
  id: string,
  score: ActivationScore,
): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;
  const r = await pool.query(
    `UPDATE acquisition_leads SET activation_score = $2::acquisition_activation_score, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, score],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function updateAcquisitionLeadStage(
  id: string,
  stage: AcquisitionLeadStage,
  patch?: {
    activationScore?: ActivationScore;
    abandonedAt?: Date | null;
    convertedAt?: Date | null;
    tenantId?: string | null;
    selectedPlanId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<AcquisitionLeadRow | null> {
  if (!(await acquisitionLeadsTableExists())) return null;

  const r = await pool.query(
    `UPDATE acquisition_leads
     SET current_stage = $2::acquisition_lead_stage,
         activation_score = COALESCE($3::acquisition_activation_score, activation_score),
         abandoned_at = COALESCE($4, abandoned_at),
         converted_at = COALESCE($5, converted_at),
         tenant_id = COALESCE($6, tenant_id),
         selected_plan_id = COALESCE($7, selected_plan_id),
         metadata_json = metadata_json || COALESCE($8::jsonb, '{}'::jsonb),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      stage,
      patch?.activationScore ?? null,
      patch?.abandonedAt ?? null,
      patch?.convertedAt ?? null,
      patch?.tenantId ?? null,
      patch?.selectedPlanId ?? null,
      patch?.metadata ? JSON.stringify(patch.metadata) : null,
    ],
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}
