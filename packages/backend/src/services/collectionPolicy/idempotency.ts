/**
 * Idempotência de actions Collection Policy: (entity, action, cycle_key, attempt).
 * Persistência via billing_audit_events (payload.idempotency_key) — fail-open se tabela ausente.
 */
import { pool } from '../../utils/db.js';
import type { CollectionActionType, CollectionEvent } from './types.js';
import { writeBillingAuditEvent } from './billingAuditEventWriter.js';

export const COLLECTION_ACTION_AUDIT_ACTION = 'collection_policy.action';

export function buildCollectionActionIdempotencyKey(input: {
  entityType: string;
  entityId: string;
  action: CollectionActionType;
  cycleKey: string;
  attempt: number;
}): string {
  const attempt = Number.isFinite(input.attempt) && input.attempt > 0 ? Math.floor(input.attempt) : 1;
  return `${input.entityType}:${input.entityId}:${input.action}:${input.cycleKey}:${attempt}`;
}

/** cycle_key a partir do evento (period_start → billing_id → data do occurred_at). */
export function resolveCycleKey(event: CollectionEvent): string {
  const meta = event.metadata ?? {};
  if (typeof meta.period_start === 'string' && meta.period_start.trim()) {
    return meta.period_start.trim();
  }
  if (event.billing_id) return event.billing_id;
  if (event.subscription_id) return event.subscription_id;
  return event.occurred_at.slice(0, 10);
}

export function resolveEntityForAction(event: CollectionEvent): { entityType: string; entityId: string } {
  if (event.billing_id) return { entityType: 'tenant_billing', entityId: event.billing_id };
  if (event.subscription_id) return { entityType: 'subscription', entityId: event.subscription_id };
  if (event.tenant_id) return { entityType: 'tenant', entityId: event.tenant_id };
  return { entityType: 'collection_event', entityId: event.type };
}

export async function wasCollectionActionExecuted(idempotencyKey: string): Promise<boolean> {
  try {
    const r = await pool.query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM billing_audit_events
       WHERE action = $1
         AND payload->>'idempotency_key' = $2
       LIMIT 1`,
      [COLLECTION_ACTION_AUDIT_ACTION, idempotencyKey]
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function markCollectionActionExecuted(input: {
  idempotencyKey: string;
  actionType: CollectionActionType;
  event: CollectionEvent;
  status: 'ok' | 'skipped' | 'error' | 'stub';
  detail?: string;
  correlation_id?: string;
}): Promise<void> {
  const { entityType, entityId } = resolveEntityForAction(input.event);
  await writeBillingAuditEvent({
    actor: 'collection_policy_engine',
    actor_type: 'system',
    action: COLLECTION_ACTION_AUDIT_ACTION,
    entity_type: entityType,
    entity_id: entityId,
    reason: input.detail ?? input.status,
    origin: 'collection_policy',
    correlation_id: input.correlation_id ?? input.event.correlation_id ?? null,
    payload: {
      idempotency_key: input.idempotencyKey,
      action_type: input.actionType,
      event_type: input.event.type,
      status: input.status,
      detail: input.detail ?? null,
    },
  });
}
