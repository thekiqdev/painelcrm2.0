/**
 * Writer append-only de billing_audit_events (Sprint 2).
 * Fail-open: nunca propaga erro ao caller de cobrança.
 */
import { pool } from '../../utils/db.js';

export type BillingAuditActorType = 'system' | 'superadmin' | 'webhook' | 'worker';

export type WriteBillingAuditEventInput = {
  actor: string;
  actor_type?: BillingAuditActorType;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  reason?: string | null;
  origin?: string | null;
  correlation_id?: string | null;
  /** Será sanitizado (sem pan/cvv/keys) */
  payload?: Record<string, unknown> | null;
};

const SENSITIVE_KEY_RE = /password|secret|token|cvv|cvc|pan|card_number|creditcard|api_key|authorization/i;

function sanitizePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (payload == null) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizePayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Exposto para testes unitários (Sprint 2). */
export function sanitizeBillingAuditPayloadForTest(
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  return sanitizePayload(payload);
}

function isMissingRelation(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /billing_audit_events/i.test(msg);
}

/**
 * Insere evento de auditoria. Em falha: loga e retorna null (não lança).
 */
export async function writeBillingAuditEvent(
  input: WriteBillingAuditEventInput
): Promise<{ id: string } | null> {
  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO billing_audit_events
         (actor, actor_type, action, entity_type, entity_id, reason, origin, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id::text`,
      [
        input.actor,
        input.actor_type ?? 'system',
        input.action,
        input.entity_type,
        input.entity_id ?? null,
        input.reason ?? null,
        input.origin ?? null,
        input.correlation_id ?? null,
        input.payload != null ? JSON.stringify(sanitizePayload(input.payload)) : null,
      ]
    );
    return r.rows[0] ?? null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingRelation(e)) {
      console.warn('[billing_audit_events] tabela ausente — rode migration 298; evento descartado');
    } else {
      console.warn('[billing_audit_events] write failed (fail-open)', msg);
    }
    return null;
  }
}
