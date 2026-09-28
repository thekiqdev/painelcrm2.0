/**
 * Dual-write em `subscription_cycles` (Etapa 3). Nunca deve falhar o motor legado: erros são engolidos após log.
 * Sprint 5.0-23A: INSERT inicial delegado ao SubscriptionCycleMaterializer.
 */
import { billingLog } from './billingLogger.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
} from '../utils/billingCycleKey.js';
import { safeTodayYmd } from '../utils/billingSafeDate.js';
import {
  ensureSubscriptionCycle,
  updateSubscriptionCycleLifecycle,
  type DbQueryable,
} from './subscriptionCycleMaterializer.js';

const OUTCOME_FAILED_MAX = 'failed_max_attempts';

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)
  );
}

function logDualWriteError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  billingLog('worker', 'subscription_cycles_dual_write_error', {
    context,
    error: msg.slice(0, 800),
  });
}

async function guardWrite(run: (db: DbQueryable) => Promise<void>, db: DbQueryable, context: string): Promise<void> {
  try {
    if (!(await isSubscriptionCyclesWriteEnabled())) return;
    await run(db);
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return;
    logDualWriteError(context, e);
  }
}

/**
 * @deprecated Wrapper temporário — delega ao SubscriptionCycleMaterializer (Sprint 5.0-23A).
 */
export async function subscriptionCyclesUpsertAfterScheduler(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleKeyCanonical: string;
    jobId: string | null;
    schedulingMeta?: Record<string, unknown> | null;
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      await ensureSubscriptionCycle(d, {
        tenantId: params.tenantId,
        subscriptionId: params.subscriptionId,
        cycleDateYmd: params.cycleKeyCanonical,
        source: 'scheduler',
        jobId: params.jobId,
        schedulingMeta: params.schedulingMeta,
      });
    },
    db,
    'scheduler_upsert'
  );
}

/**
 * Worker: após marcar job como processing.
 */
export async function subscriptionCyclesMarkProcessing(
  db: DbQueryable,
  job: { id: string; subscription_id: string; tenant_id: string; cycle_key: string }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate =
        normalizeBillingCycleKeyYmd(job.cycle_key) || normalizeSubscriptionNextBillingYmd(job.cycle_key);
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      await updateSubscriptionCycleLifecycle(d, {
        tenantId: job.tenant_id,
        subscriptionId: job.subscription_id,
        cycleDate,
        status: 'processing',
        jobId: job.id,
        invoiceId: null,
        processedAt: false,
        skippedReason: null,
        errorMessage: null,
        extraMeta: null,
      });
    },
    db,
    'mark_processing'
  );
}

/**
 * Worker: job voltou a pending (janela horária / retry_at).
 */
export async function subscriptionCyclesMarkQueued(db: DbQueryable, jobId: string): Promise<void> {
  await guardWrite(
    async (d) => {
      const jr = await d.query(
        `SELECT subscription_id::text, tenant_id::text, cycle_key FROM billing_recurring_jobs WHERE id = $1::uuid`,
        [jobId]
      );
      const row = jr.rows[0] as
        | { subscription_id: string; tenant_id: string; cycle_key: string }
        | undefined;
      if (!row) return;
      const cycleDate = normalizeBillingCycleKeyYmd(row.cycle_key);
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      await updateSubscriptionCycleLifecycle(d, {
        tenantId: row.tenant_id,
        subscriptionId: row.subscription_id,
        cycleDate,
        status: 'queued',
        jobId,
        invoiceId: null,
        processedAt: false,
        skippedReason: null,
        errorMessage: null,
        extraMeta: { requeued: true },
      });
    },
    db,
    'mark_queued'
  );
}

/**
 * Worker: conclusão do job (espelha `completeBillingRecurringJob`).
 */
export async function subscriptionCyclesOnJobCompleted(
  db: DbQueryable,
  params: {
    jobId: string;
    subscriptionId: string;
    tenantId: string;
    cycleKey: string;
    resultInvoiceId: string | null;
    resultInvoiceType: 'tenant_billing' | 'customer_invoice' | null;
    outcome: string;
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate = normalizeBillingCycleKeyYmd(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;

      const isCustomerInv =
        params.resultInvoiceType === 'customer_invoice' && params.resultInvoiceId != null;
      const isTenant =
        params.resultInvoiceType === 'tenant_billing' && params.resultInvoiceId != null;

      if (isCustomerInv) {
        await updateSubscriptionCycleLifecycle(d, {
          tenantId: params.tenantId,
          subscriptionId: params.subscriptionId,
          cycleDate,
          status: 'invoiced',
          jobId: params.jobId,
          invoiceId: params.resultInvoiceId,
          processedAt: true,
          skippedReason: null,
          errorMessage: null,
          extraMeta: { outcome: params.outcome },
        });
        return;
      }

      if (isTenant) {
        await updateSubscriptionCycleLifecycle(d, {
          tenantId: params.tenantId,
          subscriptionId: params.subscriptionId,
          cycleDate,
          status: 'skipped',
          jobId: params.jobId,
          invoiceId: null,
          processedAt: true,
          skippedReason: params.outcome,
          errorMessage: null,
          extraMeta: { tenant_billing_invoice_id: params.resultInvoiceId, outcome: params.outcome },
        });
        return;
      }

      await updateSubscriptionCycleLifecycle(d, {
        tenantId: params.tenantId,
        subscriptionId: params.subscriptionId,
        cycleDate,
        status: 'skipped',
        jobId: params.jobId,
        invoiceId: null,
        processedAt: true,
        skippedReason: params.outcome,
        errorMessage: null,
        extraMeta: { outcome: params.outcome },
      });
    },
    db,
    'job_completed'
  );
}

/**
 * Worker: cancelamento do job.
 */
export async function subscriptionCyclesOnJobCancelled(
  db: DbQueryable,
  params: {
    jobId: string;
    subscriptionId: string;
    tenantId: string;
    cycleKey: string;
    outcome: string;
    guardObsolete?: { subscriptionNextBillingYmd: string };
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate = normalizeBillingCycleKeyYmd(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;

      if (params.guardObsolete) {
        const subNext = normalizeBillingCycleKeyYmd(params.guardObsolete.subscriptionNextBillingYmd);
        if (subNext && subNext === cycleDate) {
          return;
        }
      }

      await updateSubscriptionCycleLifecycle(d, {
        tenantId: params.tenantId,
        subscriptionId: params.subscriptionId,
        cycleDate,
        status: 'cancelled',
        jobId: params.jobId,
        invoiceId: null,
        processedAt: true,
        skippedReason: params.outcome,
        errorMessage: null,
        extraMeta: { cancelled: true },
      });
    },
    db,
    'job_cancelled'
  );
}

/**
 * Worker: falha com retry ou falha final.
 */
export async function subscriptionCyclesOnJobFailedAttempt(
  db: DbQueryable,
  params: {
    jobId: string;
    subscriptionId: string;
    tenantId: string;
    cycleKey: string;
    errorMessage: string;
    finalFailure: boolean;
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate = normalizeBillingCycleKeyYmd(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      const today = safeTodayYmd();
      const persistStatus =
        params.finalFailure && cycleDate < today ? 'failed' : 'pending';
      const skippedReason = params.finalFailure ? OUTCOME_FAILED_MAX : null;
      await updateSubscriptionCycleLifecycle(d, {
        tenantId: params.tenantId,
        subscriptionId: params.subscriptionId,
        cycleDate,
        status: persistStatus,
        jobId: params.jobId,
        invoiceId: null,
        processedAt: params.finalFailure && cycleDate < today,
        skippedReason,
        errorMessage: params.errorMessage.slice(0, 4000),
        extraMeta: {
          final_failure: params.finalFailure,
          recoverable: persistStatus === 'pending',
        },
      });
    },
    db,
    'job_failed_attempt'
  );
}
