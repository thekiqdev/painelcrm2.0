/**
 * Persistência de jobs de renovação (completar, cancelar, avançar assinatura).
 * Extraído de recurringBillingJobService para o BillingRenewalEngine (B0.3).
 */
import { billingLog } from './billingLogger.js';
import {
  updateSubscriptionAfterRenewal,
  type SubscriptionRenewalDb,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
  YMD_STRICT,
} from '../utils/billingCycleKey.js';
import { normalizeBillingDateFromDb } from '../billingRuntime/billingRuntimeAssertions.js';
import {
  subscriptionCyclesOnJobCancelled,
  subscriptionCyclesOnJobCompleted,
} from './subscriptionCyclesDualWriteService.js';
import { traceBillingJobMutation } from './billingJobLifecycleTrace.js';

type DbQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

/** Classificação persistida em `billing_recurring_jobs.completion_outcome` (migração 130). */
export const BILLING_RECURRING_JOB_OUTCOME = {
  COMPLETED_INVOICE_CUSTOMER: 'completed_invoice_customer',
  COMPLETED_INVOICE_SAAS: 'completed_invoice_saas',
  COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS: 'completed_no_invoice_no_eligible_items',
  COMPLETED_IDEMPOTENT_CUSTOMER: 'completed_idempotent_existing_customer_invoice',
  COMPLETED_IDEMPOTENT_SAAS: 'completed_idempotent_existing_saas_invoice',
  CANCELLED_SUBSCRIPTION_MISSING: 'cancelled_subscription_missing',
  CANCELLED_SUBSCRIPTION_NOT_ACTIVE: 'cancelled_subscription_not_active',
  CANCELLED_NEXT_BILLING_AFTER_DB_TODAY: 'cancelled_next_billing_after_db_today',
  CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE: 'cancelled_manual_next_billing_reschedule',
  CANCELLED_JOB_CYCLE_MISMATCH: 'cancelled_job_cycle_mismatch_after_reschedule',
  CANCELLED_AFTER_PERIOD_END: 'cancelled_after_period_end_at_cancel',
  CANCELLED_UNKNOWN_SUBSCRIPTION_TYPE: 'cancelled_unknown_subscription_type',
  FAILED_MAX_ATTEMPTS: 'failed_max_attempts',
  FAILED_PERMANENT_CONFIGURATION: 'failed_permanent_configuration',
} as const;

let billingJobOutcomeColumnsCache: boolean | undefined;

export async function billingJobsTableHasOutcomeColumns(db: DbQueryable): Promise<boolean> {
  if (billingJobOutcomeColumnsCache !== undefined) return billingJobOutcomeColumnsCache;
  const r = await db.query(
    `SELECT COUNT(*)::text AS c FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'billing_recurring_jobs'
       AND column_name = 'completion_outcome'`
  );
  billingJobOutcomeColumnsCache = parseInt(String(r.rows[0]?.c ?? '0'), 10) >= 1;
  return billingJobOutcomeColumnsCache;
}

function nextSubscriptionBillingAfterCycle(periodStartYmd: string, interval: BillingInterval): string {
  return calculateNextBillingDate(periodStartYmd, interval, null);
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

export type SubscriptionAdvanceAfterCompletedCycleSource =
  | 'crm_new_invoice'
  | 'crm_idempotent_invoice'
  | 'crm_no_eligible_items'
  | 'saas_new_invoice'
  | 'saas_idempotent_invoice';

export function computeFinalNextBillingForCompletedCycle(params: {
  cycleDateYmd: string;
  billingInterval: string;
  oldNextBillingRaw: unknown;
}): {
  cycleDate: string;
  computedNextYmd: string;
  finalNextYmd: string;
  reason: string;
  skippedAlreadyAhead: boolean;
} {
  const cycleDate =
    normalizeBillingCycleKeyYmd(params.cycleDateYmd) ||
    normalizeBillingDateFromDb(params.cycleDateYmd) ||
    '';
  if (!YMD_STRICT.test(cycleDate)) {
    throw new Error(`computeFinalNextBillingForCompletedCycle: cycleDate inválido: ${params.cycleDateYmd}`);
  }
  const interval = (params.billingInterval || 'monthly') as BillingInterval;
  const computedNext = nextSubscriptionBillingAfterCycle(cycleDate, interval);
  const oldNext =
    normalizeBillingCycleKeyYmd(normalizeSubscriptionNextBillingYmd(params.oldNextBillingRaw)) || '';

  if (!oldNext || !YMD_STRICT.test(oldNext)) {
    return {
      cycleDate,
      computedNextYmd: computedNext,
      finalNextYmd: computedNext,
      reason: 'old_next_invalid_use_computed',
      skippedAlreadyAhead: false,
    };
  }
  if (oldNext <= cycleDate) {
    return {
      cycleDate,
      computedNextYmd: computedNext,
      finalNextYmd: computedNext,
      reason: 'old_next_on_or_before_cycle_apply_computed',
      skippedAlreadyAhead: false,
    };
  }
  const finalNext = maxYmd(computedNext, oldNext);
  const skippedAlreadyAhead = finalNext === oldNext && oldNext > computedNext;
  const reason = skippedAlreadyAhead
    ? 'kept_subscription_ahead_no_regress'
    : 'old_next_after_cycle_max_with_computed';
  return {
    cycleDate,
    computedNextYmd: computedNext,
    finalNextYmd: finalNext,
    reason,
    skippedAlreadyAhead,
  };
}

export async function completeBillingRecurringJob(
  db: DbQueryable,
  params: {
    jobId: string;
    resultInvoiceId: string | null;
    resultInvoiceType: 'tenant_billing' | 'customer_invoice' | null;
    outcome: string;
    detail?: string | null;
  }
): Promise<void> {
  const pre = await db.query(
    `SELECT subscription_id::text, tenant_id::text, cycle_key FROM billing_recurring_jobs WHERE id = $1::uuid`,
    [params.jobId]
  );
  const jobRow = (pre.rows[0] ?? null) as {
    subscription_id: string;
    tenant_id: string;
    cycle_key: string;
  } | null;

  const has = await billingJobsTableHasOutcomeColumns(db);
  if (has) {
    const completeSql = `UPDATE billing_recurring_jobs SET
        status = 'completed',
        result_invoice_id = $2,
        result_invoice_type = $3,
        completion_outcome = $4,
        completion_detail = $5,
        updated_at = now()
      WHERE id = $1`;
    const completeBinds = [
      params.jobId,
      params.resultInvoiceId,
      params.resultInvoiceType,
      params.outcome,
      params.detail ?? null,
    ];
    await traceBillingJobMutation({
      db,
      jobId: params.jobId,
      subscriptionId: jobRow?.subscription_id ?? null,
      phase: 'complete_billing_recurring_job',
      operation: 'UPDATE',
      sql: completeSql,
      binds: completeBinds,
      whereHint: 'id = $1',
      expectedStatus: 'completed',
      caller: {
        file: 'billingRecurringJobPersistence.ts',
        line: 145,
        function: 'completeBillingRecurringJob',
      },
      execute: () => db.query(completeSql, completeBinds),
    });
  } else {
    const completeSql = `UPDATE billing_recurring_jobs SET
        status = 'completed',
        result_invoice_id = $2,
        result_invoice_type = $3,
        updated_at = now()
      WHERE id = $1`;
    const completeBinds = [params.jobId, params.resultInvoiceId, params.resultInvoiceType];
    await traceBillingJobMutation({
      db,
      jobId: params.jobId,
      subscriptionId: jobRow?.subscription_id ?? null,
      phase: 'complete_billing_recurring_job',
      operation: 'UPDATE',
      sql: completeSql,
      binds: completeBinds,
      whereHint: 'id = $1',
      expectedStatus: 'completed',
      caller: {
        file: 'billingRecurringJobPersistence.ts',
        line: 157,
        function: 'completeBillingRecurringJob',
      },
      execute: () => db.query(completeSql, completeBinds),
    });
  }

  if (jobRow) {
    await subscriptionCyclesOnJobCompleted(db, {
      jobId: params.jobId,
      subscriptionId: jobRow.subscription_id,
      tenantId: jobRow.tenant_id,
      cycleKey: jobRow.cycle_key,
      resultInvoiceId: params.resultInvoiceId,
      resultInvoiceType: params.resultInvoiceType,
      outcome: params.outcome,
    });
  }
}

export async function cancelBillingRecurringJob(
  db: DbQueryable,
  jobId: string,
  outcome: string,
  detail?: string | null,
  subscriptionNextBillingYmdForMismatchGuard?: string | null
): Promise<void> {
  const pre = await db.query(
    `SELECT subscription_id::text, tenant_id::text, cycle_key FROM billing_recurring_jobs WHERE id = $1::uuid`,
    [jobId]
  );
  const jobRow = (pre.rows[0] ?? null) as {
    subscription_id: string;
    tenant_id: string;
    cycle_key: string;
  } | null;

  const has = await billingJobsTableHasOutcomeColumns(db);
  if (has) {
    const cancelSql = `UPDATE billing_recurring_jobs SET
        status = 'cancelled',
        completion_outcome = $2,
        completion_detail = $3,
        updated_at = now()
      WHERE id = $1`;
    const cancelBinds = [jobId, outcome, detail ?? null];
    await traceBillingJobMutation({
      db,
      jobId,
      subscriptionId: jobRow?.subscription_id ?? null,
      phase: 'cancel_billing_recurring_job',
      operation: 'UPDATE',
      sql: cancelSql,
      binds: cancelBinds,
      whereHint: 'id = $1',
      expectedStatus: 'cancelled',
      caller: {
        file: 'billingRecurringJobPersistence.ts',
        line: 200,
        function: 'cancelBillingRecurringJob',
      },
      execute: () => db.query(cancelSql, cancelBinds),
    });
  } else {
    const cancelSql = `UPDATE billing_recurring_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1`;
    await traceBillingJobMutation({
      db,
      jobId,
      subscriptionId: jobRow?.subscription_id ?? null,
      phase: 'cancel_billing_recurring_job',
      operation: 'UPDATE',
      sql: cancelSql,
      binds: [jobId],
      whereHint: 'id = $1',
      expectedStatus: 'cancelled',
      caller: {
        file: 'billingRecurringJobPersistence.ts',
        line: 210,
        function: 'cancelBillingRecurringJob',
      },
      execute: () => db.query(cancelSql, [jobId]),
    });
  }
  billingLog('job', 'job_cancelled', { jobId, outcome, detail: detail ?? undefined });

  if (jobRow) {
    const guardNext =
      subscriptionNextBillingYmdForMismatchGuard != null
        ? normalizeBillingCycleKeyYmd(
            normalizeSubscriptionNextBillingYmd(subscriptionNextBillingYmdForMismatchGuard)
          ) || normalizeBillingDateFromDb(subscriptionNextBillingYmdForMismatchGuard) || ''
        : '';
    const guard =
      outcome === BILLING_RECURRING_JOB_OUTCOME.CANCELLED_JOB_CYCLE_MISMATCH && guardNext !== ''
        ? { subscriptionNextBillingYmd: guardNext }
        : undefined;
    await subscriptionCyclesOnJobCancelled(db, {
      jobId,
      subscriptionId: jobRow.subscription_id,
      tenantId: jobRow.tenant_id,
      cycleKey: jobRow.cycle_key,
      outcome,
      guardObsolete: guard,
    });
  }
}

export async function advanceSubscriptionAfterCompletedCycle(
  db: DbQueryable,
  params: {
    jobId: string;
    subscriptionId: string;
    tenantId: string;
    cycleDateYmd: string;
    source: SubscriptionAdvanceAfterCompletedCycleSource;
    resultInvoiceId?: string | null;
  }
): Promise<void> {
  const subR = await db.query(
    `SELECT billing_interval::text, next_billing_date::text, billing_cycle_count::int
     FROM subscriptions
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     FOR UPDATE`,
    [params.subscriptionId, params.tenantId]
  );
  const sub = subR.rows[0] as {
    billing_interval: string;
    next_billing_date: string;
    billing_cycle_count: number;
  } | undefined;
  const row = subR.rows[0];
  if (!row) {
    throw new Error(
      `advanceSubscriptionAfterCompletedCycle: assinatura não encontrada (subscription_id=${params.subscriptionId})`
    );
  }

  const oldNorm =
    normalizeBillingCycleKeyYmd(normalizeSubscriptionNextBillingYmd(row.next_billing_date)) || '';
  const decision = computeFinalNextBillingForCompletedCycle({
    cycleDateYmd: params.cycleDateYmd,
    billingInterval: row.billing_interval || 'monthly',
    oldNextBillingRaw: row.next_billing_date,
  });

  billingLog('job', 'subscription_cycle_advance_check', {
    jobId: params.jobId,
    subscription_id: params.subscriptionId,
    tenant_id: params.tenantId,
    cycle_date: decision.cycleDate,
    interval: row.billing_interval ?? '',
    old_next_billing_date: oldNorm,
    computed_next_billing_date: decision.computedNextYmd,
    source: params.source,
    ...(params.resultInvoiceId != null && params.resultInvoiceId !== ''
      ? { invoice_id: String(params.resultInvoiceId) }
      : {}),
  });

  if (decision.finalNextYmd <= decision.cycleDate) {
    throw new Error(
      `advanceSubscriptionAfterCompletedCycle: final_next (${decision.finalNextYmd}) deve ser posterior ao ciclo (${decision.cycleDate}); interval=${row.billing_interval}`
    );
  }

  if (decision.skippedAlreadyAhead) {
    billingLog('job', 'subscription_cycle_advance_skipped_already_ahead', {
      jobId: params.jobId,
      subscription_id: params.subscriptionId,
      tenant_id: params.tenantId,
      cycle_date: decision.cycleDate,
      computed_next_billing_date: decision.computedNextYmd,
      final_next_billing_date: decision.finalNextYmd,
      reason: decision.reason,
      source: params.source,
    });
  }

  const nextCount = Number(row.billing_cycle_count) + 1;

  billingLog('job', 'subscription_cycle_advance_applied', {
    jobId: params.jobId,
    subscription_id: params.subscriptionId,
    tenant_id: params.tenantId,
    cycle_date: decision.cycleDate,
    interval: row.billing_interval ?? '',
    old_next_billing_date: oldNorm,
    computed_next_billing_date: decision.computedNextYmd,
    final_next_billing_date: decision.finalNextYmd,
    billing_cycle_count: String(nextCount),
    reason: decision.reason,
    source: params.source,
    ...(params.resultInvoiceId != null && params.resultInvoiceId !== ''
      ? { invoice_id: String(params.resultInvoiceId) }
      : {}),
  });

  await updateSubscriptionAfterRenewal(db as SubscriptionRenewalDb, params.subscriptionId, params.tenantId, {
    next_billing_date: decision.finalNextYmd,
    current_period_start: decision.cycleDate,
    current_period_end: decision.finalNextYmd,
    billing_cycle_count: nextCount,
  });
}

export function subscriptionSnapshotForTrace(sub: SubscriptionRow): Record<string, unknown> {
  return {
    id: sub.id,
    status: sub.status,
    customer_id: sub.customer_id,
    billing_interval: sub.billing_interval,
    next_billing_date: sub.next_billing_date,
    current_period_start: sub.current_period_start,
    amount_cents: sub.amount_cents,
  };
}
