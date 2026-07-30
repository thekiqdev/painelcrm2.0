/**
 * Sprint 3 — closeout natural: max_cycles atingido → status completed + cancel Pix Auto.
 */
import { pool } from '../../utils/db.js';
import { billingLog } from '../billingLogger.js';
import { cancelPendingRenewalJobsForSubscription } from '../customerInvoiceRecurrenceNextBillingService.js';

export async function countEmittedSubscriptionCycles(
  tenantId: string,
  subscriptionId: string
): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM subscription_cycles
     WHERE tenant_id = $1::uuid
       AND subscription_id = $2::uuid
       AND invoice_id IS NOT NULL`,
    [tenantId, subscriptionId]
  );
  return r.rows[0]?.n ?? 0;
}

/**
 * True se ainda pode emitir cobrança (ilimitado ou emitted < max).
 * completed/cancelled → false.
 */
export async function customerSubscriptionHasRemainingChargeSlots(opts: {
  tenantId: string;
  subscriptionId: string;
}): Promise<{ allowed: boolean; detail: string; emitted?: number; max?: number | null }> {
  const subR = await pool.query<{
    status: string;
    type: string;
    cycles_unlimited: boolean | null;
    max_cycles: number | null;
  }>(
    `SELECT status::text AS status,
            type::text AS type,
            COALESCE(cycles_unlimited, true) AS cycles_unlimited,
            max_cycles
     FROM subscriptions
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [opts.subscriptionId, opts.tenantId]
  );
  const sub = subR.rows[0];
  if (!sub) return { allowed: false, detail: 'subscription_not_found' };
  if (sub.type !== 'customer') return { allowed: true, detail: 'not_customer' };
  if (sub.status === 'cancelled' || sub.status === 'completed') {
    return { allowed: false, detail: sub.status };
  }
  if (sub.cycles_unlimited !== false) {
    return { allowed: true, detail: 'unlimited' };
  }
  const max =
    sub.max_cycles != null && Number.isFinite(Number(sub.max_cycles))
      ? Math.trunc(Number(sub.max_cycles))
      : null;
  if (max == null || max < 1) return { allowed: true, detail: 'no_max' };
  const emitted = await countEmittedSubscriptionCycles(opts.tenantId, opts.subscriptionId);
  if (emitted >= max) {
    return { allowed: false, detail: 'max_cycles_exhausted', emitted, max };
  }
  return { allowed: true, detail: 'ok', emitted, max };
}

/**
 * Se contrato finito e emitidos >= max_cycles → Finalizada + cancela auth Asaas.
 * Idempotente; fail-open no cancel da auth.
 */
export async function completeCustomerSubscriptionIfCyclesExhausted(opts: {
  tenantId: string;
  subscriptionId: string;
  correlationId?: string | null;
}): Promise<{ completed: boolean; detail: string; emitted?: number; max?: number }> {
  try {
    const subR = await pool.query<{
      status: string;
      type: string;
      cycles_unlimited: boolean | null;
      max_cycles: number | null;
    }>(
      `SELECT status::text AS status,
              type::text AS type,
              COALESCE(cycles_unlimited, true) AS cycles_unlimited,
              max_cycles
       FROM subscriptions
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       LIMIT 1`,
      [opts.subscriptionId, opts.tenantId]
    );
    const sub = subR.rows[0];
    if (!sub || sub.type !== 'customer') {
      return { completed: false, detail: 'not_customer' };
    }
    if (sub.status === 'completed') {
      return { completed: false, detail: 'already_completed' };
    }
    if (sub.status === 'cancelled') {
      return { completed: false, detail: 'already_cancelled' };
    }
    if (sub.cycles_unlimited !== false) {
      return { completed: false, detail: 'unlimited' };
    }
    const max =
      sub.max_cycles != null && Number.isFinite(Number(sub.max_cycles))
        ? Math.trunc(Number(sub.max_cycles))
        : null;
    if (max == null || max < 1) {
      return { completed: false, detail: 'no_max_cycles' };
    }

    const emitted = await countEmittedSubscriptionCycles(opts.tenantId, opts.subscriptionId);
    if (emitted < max) {
      return { completed: false, detail: 'not_exhausted', emitted, max };
    }

    await pool.query(
      `UPDATE subscriptions
       SET status = 'completed',
           ended_reason = 'cycles_exhausted',
           cancel_at_period_end = false,
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'customer'
         AND status IN ('active', 'paused', 'past_due', 'trialing')`,
      [opts.subscriptionId, opts.tenantId]
    );

    await cancelPendingRenewalJobsForSubscription(opts.subscriptionId, {
      detail: {
        reason: 'cycles_exhausted',
        subscription_id: opts.subscriptionId,
      },
    });

    try {
      const { cancelPixAutomaticAuthorizationForCrmSubscription } = await import(
        './crmPixAutomaticService.js'
      );
      await cancelPixAutomaticAuthorizationForCrmSubscription({
        tenantId: opts.tenantId,
        subscriptionId: opts.subscriptionId,
        correlationId: opts.correlationId ?? `cycles_exhausted:${opts.subscriptionId}`,
        reason: 'cycles_exhausted',
      });
    } catch (e) {
      console.warn(
        '[completeCustomerSubscriptionIfCyclesExhausted] pix auto cancel',
        e instanceof Error ? e.message : e
      );
    }

    billingLog('job', 'subscription_completed_cycles_exhausted', {
      subscription_id: opts.subscriptionId,
      tenant_id: opts.tenantId,
      emitted,
      max_cycles: max,
    });

    return { completed: true, detail: 'completed', emitted, max };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('job', 'subscription_complete_cycles_exhausted_error', {
      subscription_id: opts.subscriptionId,
      error: msg.slice(0, 500),
    });
    return { completed: false, detail: msg.slice(0, 200) };
  }
}
