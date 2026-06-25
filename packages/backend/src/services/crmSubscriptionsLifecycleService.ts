/**
 * Sprint S2.4 — pause, resume e reactivate de assinaturas CRM (type=customer).
 */
import { pool } from '../utils/db.js';
import { getSubscriptionById, type SubscriptionRow } from './billingSubscriptionService.js';
import { cancelPendingRenewalJobsForSubscription } from './customerInvoiceRecurrenceNextBillingService.js';
import { tryEnqueueRenewalJobForSubscriptionId } from './recurringBillingJobService.js';
import {
  insertSubscriptionChangeEvent,
  listSubscriptionLifecycleEvents,
  type SubscriptionLifecycleEventRow,
} from './subscriptionChangeEventsRepository.js';

const NEXT_BILLING_YMD = /^\d{4}-\d{2}-\d{2}$/;

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

async function readMetadata(subscriptionId: string): Promise<unknown> {
  const r = await pool.query<{ metadata: unknown }>(
    `SELECT metadata FROM subscriptions WHERE id = $1 LIMIT 1`,
    [subscriptionId]
  );
  return r.rows[0]?.metadata ?? null;
}

function assertCustomerCrmSubscription(
  sub: SubscriptionRow | null,
  tenantId: string
): asserts sub is SubscriptionRow {
  if (!sub || sub.tenant_id !== tenantId || sub.type !== 'customer') {
    throw new Error('Assinatura não encontrada');
  }
}

export async function pauseCrmSubscription(params: {
  tenantId: string;
  subscriptionId: string;
  reason: string;
  actorUserId?: string | null;
}): Promise<SubscriptionRow> {
  const reason = String(params.reason ?? '').trim();
  if (!reason) {
    throw new Error('Motivo da pausa é obrigatório');
  }

  const sub = await getSubscriptionById(params.subscriptionId);
  assertCustomerCrmSubscription(sub, params.tenantId);

  if (sub.status !== 'active') {
    throw new Error('Só é possível pausar assinaturas ativas');
  }

  const metadata = await readMetadata(sub.id);
  const pausedAt = new Date().toISOString();
  const nextMetadata = mergeMetadata(metadata, {
    paused_reason: reason,
    paused_at: pausedAt,
    paused_by: params.actorUserId ?? null,
  });

  await pool.query(
    `UPDATE subscriptions
     SET status = 'paused', metadata = $2::jsonb, updated_at = now()
     WHERE id = $1 AND tenant_id = $3`,
    [sub.id, JSON.stringify(nextMetadata), params.tenantId]
  );

  await cancelPendingRenewalJobsForSubscription(sub.id, {
    detail: { reason: 'subscription_paused_crm', subscription_id: sub.id },
  });

  await insertSubscriptionChangeEvent({
    tenantId: params.tenantId,
    subscriptionId: sub.id,
    change_type: 'pause',
    status: 'applied',
    reason,
    created_by: params.actorUserId ?? null,
  });

  const updated = await getSubscriptionById(sub.id);
  if (!updated) throw new Error('Assinatura não encontrada após pausa');
  return updated;
}

export async function resumeCrmSubscription(params: {
  tenantId: string;
  subscriptionId: string;
  next_billing_date: string;
  reason?: string | null;
  actorUserId?: string | null;
}): Promise<SubscriptionRow> {
  const nextYmd = params.next_billing_date.trim();
  if (!NEXT_BILLING_YMD.test(nextYmd)) {
    throw new Error('next_billing_date deve ser YYYY-MM-DD');
  }

  const sub = await getSubscriptionById(params.subscriptionId);
  assertCustomerCrmSubscription(sub, params.tenantId);

  if (sub.status !== 'paused') {
    throw new Error('Só é possível retomar assinaturas pausadas');
  }

  const metadata = await readMetadata(sub.id);
  const nextMetadata = mergeMetadata(metadata, {
    paused_reason: null,
    paused_at: null,
    paused_by: null,
  });

  await pool.query(
    `UPDATE subscriptions
     SET status = 'active',
         next_billing_date = $2::date,
         billing_anchor_day = EXTRACT(DAY FROM $2::date)::int,
         metadata = $3::jsonb,
         updated_at = now()
     WHERE id = $1 AND tenant_id = $4`,
    [sub.id, nextYmd, JSON.stringify(nextMetadata), params.tenantId]
  );

  await insertSubscriptionChangeEvent({
    tenantId: params.tenantId,
    subscriptionId: sub.id,
    change_type: 'resume',
    status: 'applied',
    reason: params.reason ?? null,
    next_billing_date: nextYmd,
    created_by: params.actorUserId ?? null,
  });

  try {
    await tryEnqueueRenewalJobForSubscriptionId(sub.id);
  } catch {
    /* enqueue best-effort após retomada */
  }

  const updated = await getSubscriptionById(sub.id);
  if (!updated) throw new Error('Assinatura não encontrada após retomada');
  return updated;
}

export async function reactivateCrmSubscription(params: {
  tenantId: string;
  subscriptionId: string;
  next_billing_date: string;
  reason?: string | null;
  actorUserId?: string | null;
}): Promise<SubscriptionRow> {
  const nextYmd = params.next_billing_date.trim();
  if (!NEXT_BILLING_YMD.test(nextYmd)) {
    throw new Error('next_billing_date deve ser YYYY-MM-DD');
  }

  const sub = await getSubscriptionById(params.subscriptionId);
  assertCustomerCrmSubscription(sub, params.tenantId);

  if (sub.status !== 'cancelled') {
    throw new Error('Só é possível reativar assinaturas canceladas');
  }

  const metadata = await readMetadata(sub.id);
  const nextMetadata = mergeMetadata(metadata, {
    paused_reason: null,
    paused_at: null,
    paused_by: null,
  });

  await pool.query(
    `UPDATE subscriptions
     SET status = 'active',
         cancelled_at = NULL,
         cancel_at_period_end = false,
         next_billing_date = $2::date,
         billing_anchor_day = EXTRACT(DAY FROM $2::date)::int,
         metadata = $3::jsonb,
         updated_at = now()
     WHERE id = $1 AND tenant_id = $4`,
    [sub.id, nextYmd, JSON.stringify(nextMetadata), params.tenantId]
  );

  await insertSubscriptionChangeEvent({
    tenantId: params.tenantId,
    subscriptionId: sub.id,
    change_type: 'reactivate',
    status: 'applied',
    reason: params.reason ?? null,
    next_billing_date: nextYmd,
    created_by: params.actorUserId ?? null,
  });

  try {
    await tryEnqueueRenewalJobForSubscriptionId(sub.id);
  } catch {
    /* enqueue best-effort após reativação */
  }

  const updated = await getSubscriptionById(sub.id);
  if (!updated) throw new Error('Assinatura não encontrada após reativação');
  return updated;
}

export type { SubscriptionLifecycleEventRow };

export async function getSubscriptionLifecycleEventsForTimeline(
  tenantId: string,
  subscriptionId: string
): Promise<SubscriptionLifecycleEventRow[]> {
  return listSubscriptionLifecycleEvents(tenantId, subscriptionId);
}
