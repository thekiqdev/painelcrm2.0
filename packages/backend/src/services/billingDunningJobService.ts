/**
 * Billing 2.0 Sprint 8 — Dunning / Recovery cycle sob Feature Flag.
 *
 * Flag `dunning_enabled` (default OFF, destrutiva).
 * Emite eventos Collection Policy (overdue / grace / cancel / failed retry).
 * Suspend/cancel só ocorrem se engine ON + policy + flags auto_* ON.
 */
import { pool } from '../utils/db.js';
import { isBilling2FlagEnabled } from './billing2/billingFeatureFlags.js';
import { getActiveCollectionPolicy } from './collectionPolicy/reader.js';
import { scheduleCollectionPolicyExtensionPoint } from './collectionPolicy/hook.js';
import { tenantBillingCorrelationId } from './billing2/billingCorrelationId.js';
import { writeBillingAuditEvent } from './collectionPolicy/billingAuditEventWriter.js';
import { billingLog } from './billingLogger.js';

export type DunningRunResult = {
  skipped: boolean;
  reason?: string;
  dry_run: boolean;
  scanned: number;
  overdue_events: number;
  grace_events: number;
  cancel_events: number;
  retry_events: number;
};

function daysBetween(dueDate: string, todayYmd: string): number {
  const a = Date.parse(`${dueDate}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

export async function runBillingDunningCycle(opts: {
  dryRun?: boolean;
  limit?: number;
  actor?: string;
}): Promise<DunningRunResult> {
  const dryRun = opts.dryRun !== false;
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const flagOn = await isBilling2FlagEnabled('dunning_enabled');

  // Emit exige flag; dry-run escaneia e conta eventos potenciais sem mutar.
  if (!dryRun && !flagOn) {
    return {
      skipped: true,
      reason: 'flag_dunning_enabled_off',
      dry_run: false,
      scanned: 0,
      overdue_events: 0,
      grace_events: 0,
      cancel_events: 0,
      retry_events: 0,
    };
  }

  const { policy } = await getActiveCollectionPolicy();
  const todayR = await pool.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
  const today = todayR.rows[0]?.d ?? new Date().toISOString().slice(0, 10);

  const r = await pool.query<{
    id: string;
    tenant_id: string;
    subscription_id: string | null;
    due_date: string;
    status: string;
    amount_cents: number;
  }>(
    `SELECT
       tb.id::text AS id,
       tb.tenant_id::text AS tenant_id,
       tb.subscription_id::text AS subscription_id,
       tb.due_date::text AS due_date,
       tb.status,
       tb.amount_cents
     FROM tenant_billing tb
     WHERE tb.status IN ('overdue', 'pending', 'waiting_payment', 'processing')
       AND tb.due_date < CURRENT_DATE
     ORDER BY tb.due_date ASC
     LIMIT $1`,
    [limit]
  );

  let overdue_events = 0;
  let grace_events = 0;
  let cancel_events = 0;
  let retry_events = 0;

  for (const row of r.rows) {
    const days = daysBetween(row.due_date, today);
    const corr = tenantBillingCorrelationId(row.id);

    const emit = (type: 'payment.overdue' | 'grace.elapsed' | 'cancel.threshold_elapsed' | 'payment.failed') => {
      if (dryRun) return;
      scheduleCollectionPolicyExtensionPoint({
        type,
        occurred_at: new Date().toISOString(),
        billing_id: row.id,
        tenant_id: row.tenant_id,
        subscription_id: row.subscription_id ?? undefined,
        correlation_id: corr,
        attempt: Math.max(1, Math.floor(days / Math.max(1, policy.attempt_interval_days)) + 1),
        metadata: {
          days_overdue: days,
          due_date: row.due_date,
          amount_cents: row.amount_cents,
          dunning: true,
        },
      });
    };

    // Sempre sinaliza overdue (notify / past_due sob policy+flags)
    emit('payment.overdue');
    overdue_events += 1;

    // Retry PIX/notify conforme intervalo e max_attempts
    if (
      days >= policy.attempt_interval_days &&
      Math.floor(days / Math.max(1, policy.attempt_interval_days)) < policy.max_attempts
    ) {
      emit('payment.failed');
      retry_events += 1;
    }

    if (days >= policy.grace_period_days && days >= policy.suspend_after_days) {
      emit('grace.elapsed');
      grace_events += 1;
    }

    if (days >= policy.cancel_after_days) {
      emit('cancel.threshold_elapsed');
      cancel_events += 1;
    }
  }

  const result: DunningRunResult = {
    skipped: false,
    dry_run: dryRun,
    scanned: r.rows.length,
    overdue_events,
    grace_events,
    cancel_events,
    retry_events,
  };

  billingLog('job', 'dunning_cycle_done', {
    dry_run: dryRun,
    scanned: result.scanned,
    overdue_events,
    grace_events,
    cancel_events,
    retry_events,
  });

  await writeBillingAuditEvent({
    actor: opts.actor ?? 'dunning_job',
    actor_type: 'system',
    action: 'dunning.cycle',
    entity_type: 'dunning',
    entity_id: null,
    reason: dryRun ? 'dry_run' : 'emit_events',
    origin: 'dunning_job',
    payload: { ...result, policy_max_attempts: policy.max_attempts },
  });

  return result;
}
