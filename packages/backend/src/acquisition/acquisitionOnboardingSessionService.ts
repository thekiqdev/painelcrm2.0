import { randomBytes } from 'crypto';
import { pool } from '../utils/db.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

export type ActivationIntent = 'trial' | 'payment';

export type OnboardingSessionRow = {
  id: string;
  session_token: string;
  acquisition_lead_id: string;
  activation_intent: ActivationIntent;
  plan_id: string | null;
  users_count: number | null;
  resume_step: number;
  current_step: string;
  completed_steps: string[];
  activation_progress: number;
  status: string;
  payment_status: string | null;
  payment_billing_id: string | null;
  tenant_id: string | null;
  correlation_id: string;
  metadata_json: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

let tableExistsCache: boolean | undefined;

export async function onboardingSessionsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'acquisition_onboarding_sessions'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

function mapSession(row: Record<string, unknown>): OnboardingSessionRow {
  return {
    id: String(row.id),
    session_token: String(row.session_token),
    acquisition_lead_id: String(row.acquisition_lead_id),
    activation_intent: row.activation_intent as ActivationIntent,
    plan_id: row.plan_id != null ? String(row.plan_id) : null,
    users_count: row.users_count != null ? Number(row.users_count) : null,
    resume_step: Number(row.resume_step ?? 1),
    current_step: String(row.current_step ?? 'company'),
    completed_steps: Array.isArray(row.completed_steps) ? (row.completed_steps as string[]) : [],
    activation_progress: Number(row.activation_progress ?? 0),
    status: String(row.status),
    payment_status: row.payment_status != null ? String(row.payment_status) : null,
    payment_billing_id: row.payment_billing_id != null ? String(row.payment_billing_id) : null,
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    correlation_id: String(row.correlation_id),
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function newSessionToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function createOnboardingSession(input: {
  leadId: string;
  intent: ActivationIntent;
  planId: string;
  usersCount?: number | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
}): Promise<OnboardingSessionRow | null> {
  if (!(await onboardingSessionsTableExists())) return null;

  await pool.query(
    `UPDATE acquisition_onboarding_sessions
     SET status = 'cancelled', updated_at = now()
     WHERE acquisition_lead_id = $1 AND status = 'active'`,
    [input.leadId],
  );

  const token = newSessionToken();
  const r = await pool.query(
    `INSERT INTO acquisition_onboarding_sessions (
       session_token, acquisition_lead_id, activation_intent, plan_id, users_count,
       correlation_id, metadata_json, status, resume_step
     ) VALUES ($1, $2, $3::acquisition_activation_intent, $4, $5, $6, $7::jsonb, 'active', 1)
     RETURNING *`,
    [
      token,
      input.leadId,
      input.intent,
      input.planId,
      input.usersCount ?? null,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return r.rows[0] ? mapSession(r.rows[0]) : null;
}

export async function findOnboardingSessionByToken(token: string): Promise<OnboardingSessionRow | null> {
  if (!(await onboardingSessionsTableExists())) return null;
  const r = await pool.query(
    `SELECT * FROM acquisition_onboarding_sessions
     WHERE session_token = $1 AND status = 'active' AND expires_at > now()
     LIMIT 1`,
    [token],
  );
  return r.rows[0] ? mapSession(r.rows[0]) : null;
}

/** Sessões ativas ou recém-concluídas — usado para retomar wizard após conclusão (ex.: refresh). */
export async function findOnboardingSessionByTokenForAccess(
  token: string,
): Promise<OnboardingSessionRow | null> {
  if (!(await onboardingSessionsTableExists())) return null;
  const r = await pool.query(
    `SELECT * FROM acquisition_onboarding_sessions
     WHERE session_token = $1 AND status IN ('active', 'completed') AND expires_at > now()
     LIMIT 1`,
    [token],
  );
  return r.rows[0] ? mapSession(r.rows[0]) : null;
}

export async function updateOnboardingSessionResumeStep(
  sessionId: string,
  resumeStep: number,
): Promise<void> {
  await pool.query(
    `UPDATE acquisition_onboarding_sessions SET resume_step = $2, updated_at = now() WHERE id = $1`,
    [sessionId, resumeStep],
  );
}

export async function completeOnboardingSession(sessionId: string, tenantId: string): Promise<void> {
  await pool.query(
    `UPDATE acquisition_onboarding_sessions
     SET status = 'completed', tenant_id = $2, updated_at = now()
     WHERE id = $1`,
    [sessionId, tenantId],
  );
}

export async function attachLeadSessionToken(leadId: string, sessionToken: string): Promise<void> {
  const { mergeAcquisitionLeadMetadata } = await import('./acquisitionLeadRepository.js');
  await mergeAcquisitionLeadMetadata(leadId, {
    onboarding_session_token: sessionToken,
    onboarding_started_at: new Date().toISOString(),
  });
}

export async function loadSessionWithLead(
  token: string,
): Promise<{ session: OnboardingSessionRow; lead: AcquisitionLeadRow } | null> {
  const session = await findOnboardingSessionByTokenForAccess(token);
  if (!session) return null;
  const { findAcquisitionLeadById } = await import('./acquisitionLeadRepository.js');
  const lead = await findAcquisitionLeadById(session.acquisition_lead_id);
  if (!lead) return null;
  return { session, lead };
}

export async function findActiveOnboardingSessionByTenantId(
  tenantId: string,
): Promise<OnboardingSessionRow | null> {
  if (!(await onboardingSessionsTableExists())) return null;
  const r = await pool.query(
    `SELECT * FROM acquisition_onboarding_sessions
     WHERE tenant_id = $1 AND status = 'active' AND expires_at > now()
     ORDER BY updated_at DESC LIMIT 1`,
    [tenantId],
  );
  return r.rows[0] ? mapSession(r.rows[0]) : null;
}

export async function attachTenantToSession(sessionId: string, tenantId: string): Promise<void> {
  await pool.query(
    `UPDATE acquisition_onboarding_sessions
     SET tenant_id = $2, current_step = 'company', resume_step = 1, updated_at = now()
     WHERE id = $1`,
    [sessionId, tenantId],
  );
}

export async function updateOnboardingWizardSession(
  sessionId: string,
  patch: {
    current_step?: string;
    completed_steps?: string[];
    activation_progress?: number;
    resume_step?: number;
    metadata?: Record<string, unknown>;
    status?: string;
  },
): Promise<void> {
  const metaJson = patch.metadata ? JSON.stringify(patch.metadata) : null;
  await pool.query(
    `UPDATE acquisition_onboarding_sessions
     SET current_step = COALESCE($2, current_step),
         completed_steps = COALESCE($3::jsonb, completed_steps),
         activation_progress = COALESCE($4, activation_progress),
         resume_step = COALESCE($5, resume_step),
         metadata_json = CASE WHEN $6::jsonb IS NOT NULL THEN metadata_json || $6::jsonb ELSE metadata_json END,
         status = COALESCE($7, status),
         updated_at = now()
     WHERE id = $1`,
    [
      sessionId,
      patch.current_step ?? null,
      patch.completed_steps ? JSON.stringify(patch.completed_steps) : null,
      patch.activation_progress ?? null,
      patch.resume_step ?? null,
      metaJson,
      patch.status ?? null,
    ],
  );
}
