/**
 * Dual-write em `subscription_cycles` (Etapa 3). Nunca deve falhar o motor legado: erros são engolidos após log.
 */
import { billingLog } from './billingLogger.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import { isSubscriptionCyclesWriteEnabled } from './subscriptionCyclesWriteFlagService.js';

const YMD_STRICT = /^\d{4}-\d{2}-\d{2}$/;

/** Espelha `normalizeBillingCycleKeyYmd` (evita import circular com recurringBillingJobService). */
function normalizeBillingCycleKeyYmdLocal(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (YMD_STRICT.test(s)) return s;
  if (s.length >= 10 && YMD_STRICT.test(s.slice(0, 10))) {
    const sep = s[10];
    if (s.length === 10 || sep === 'T' || sep === 't' || sep === ' ') {
      return s.slice(0, 10);
    }
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    return new Date(t).toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

function normalizeSubscriptionNextBillingYmdLocal(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

const OUTCOME_FAILED_MAX = 'failed_max_attempts';

type DbQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

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

async function loadPeriodBounds(
  db: DbQueryable,
  subscriptionId: string,
  cycleDateYmd: string
): Promise<{ period_start: string; period_end: string } | null> {
  const r = await db.query(
    `SELECT billing_interval, billing_anchor_day, type FROM subscriptions WHERE id = $1 LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0] as
    | { billing_interval: string; billing_anchor_day: number | null; type: string }
    | undefined;
  if (!row) return null;
  const interval = (row.billing_interval || 'monthly') as BillingInterval;
  const period_start = cycleDateYmd;
  const period_end =
    row.type === 'customer'
      ? calculateNextBillingDate(period_start, interval, null)
      : calculateNextBillingDate(period_start, interval, row.billing_anchor_day);
  return { period_start, period_end };
}

/**
 * Scheduler: após enfileirar ou confirmar job ativo para o ciclo.
 */
export async function subscriptionCyclesUpsertAfterScheduler(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleKeyCanonical: string;
    jobId: string | null;
    /** Metadados extras (ex.: geração antecipada: generation_date, generate_days_before_due). */
    schedulingMeta?: Record<string, unknown> | null;
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate = normalizeBillingCycleKeyYmdLocal(params.cycleKeyCanonical) || params.cycleKeyCanonical;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      const bounds = await loadPeriodBounds(d, params.subscriptionId, cycleDate);
      if (!bounds) return;
      const status = params.jobId ? 'queued' : 'pending';
      const meta = JSON.stringify({
        dual_write: 'scheduler',
        v: 1,
        ...(params.schedulingMeta && typeof params.schedulingMeta === 'object' ? params.schedulingMeta : {}),
      });
      await d.query(
        `INSERT INTO subscription_cycles (
           tenant_id, subscription_id, cycle_date, period_start, period_end,
           status, job_id, invoice_id, processed_at, skipped_reason, error_message, metadata, updated_at
         )
         VALUES ($1, $2, $3::date, $4::date, $5::date, $6, $7::uuid, NULL, NULL, NULL, NULL, $8::jsonb, now())
         ON CONFLICT (subscription_id, cycle_date) DO UPDATE SET
           job_id = CASE
             WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.job_id
             WHEN EXCLUDED.job_id IS NOT NULL THEN EXCLUDED.job_id
             ELSE subscription_cycles.job_id
           END,
           status = CASE
             WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.status
             ELSE EXCLUDED.status
           END,
           period_start = CASE
             WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.period_start
             ELSE EXCLUDED.period_start
           END,
           period_end = CASE
             WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.period_end
             ELSE EXCLUDED.period_end
           END,
           metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
           updated_at = now()`,
        [
          params.tenantId,
          params.subscriptionId,
          cycleDate,
          bounds.period_start,
          bounds.period_end,
          status,
          params.jobId,
          meta,
        ]
      );
    },
    db,
    'scheduler_upsert'
  );
}

async function upsertCycleRow(
  d: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    cycleDate: string;
    status: string;
    jobId: string | null;
    invoiceId: string | null;
    processedAt: boolean;
    skippedReason: string | null;
    errorMessage: string | null;
    extraMeta: Record<string, unknown> | null;
  }
): Promise<void> {
  const bounds = await loadPeriodBounds(d, params.subscriptionId, params.cycleDate);
  if (!bounds) return;
  const baseMeta = { dual_write: 'worker', v: 1, ...(params.extraMeta ?? {}) };
  await d.query(
    `INSERT INTO subscription_cycles (
       tenant_id, subscription_id, cycle_date, period_start, period_end,
       status, job_id, invoice_id, processed_at, skipped_reason, error_message, metadata, updated_at
     )
     VALUES (
       $1, $2, $3::date, $4::date, $5::date, $6, $7::uuid, $8::uuid,
       CASE WHEN $9 THEN now() ELSE NULL END,
       $10, $11, $12::jsonb, now()
     )
     ON CONFLICT (subscription_id, cycle_date) DO UPDATE SET
       job_id = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.job_id
         WHEN EXCLUDED.job_id IS NOT NULL THEN EXCLUDED.job_id
         ELSE subscription_cycles.job_id
       END,
       status = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.status
         ELSE EXCLUDED.status
       END,
       invoice_id = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.invoice_id
         WHEN EXCLUDED.invoice_id IS NOT NULL THEN EXCLUDED.invoice_id
         ELSE subscription_cycles.invoice_id
       END,
       processed_at = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.processed_at
         WHEN EXCLUDED.processed_at IS NOT NULL THEN EXCLUDED.processed_at
         ELSE subscription_cycles.processed_at
       END,
       skipped_reason = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.skipped_reason
         ELSE COALESCE(EXCLUDED.skipped_reason, subscription_cycles.skipped_reason)
       END,
       error_message = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.error_message
         ELSE COALESCE(EXCLUDED.error_message, subscription_cycles.error_message)
       END,
       period_start = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.period_start
         ELSE EXCLUDED.period_start
       END,
       period_end = CASE
         WHEN subscription_cycles.status = 'invoiced' THEN subscription_cycles.period_end
         ELSE EXCLUDED.period_end
       END,
       metadata = COALESCE(subscription_cycles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
       updated_at = now()`,
    [
      params.tenantId,
      params.subscriptionId,
      params.cycleDate,
      bounds.period_start,
      bounds.period_end,
      params.status,
      params.jobId,
      params.invoiceId,
      params.processedAt,
      params.skippedReason,
      params.errorMessage,
      JSON.stringify(baseMeta),
    ]
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
        normalizeBillingCycleKeyYmdLocal(job.cycle_key) || normalizeSubscriptionNextBillingYmdLocal(job.cycle_key);
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      await upsertCycleRow(d, {
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
      const cycleDate = normalizeBillingCycleKeyYmdLocal(row.cycle_key);
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      await upsertCycleRow(d, {
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
      const cycleDate = normalizeBillingCycleKeyYmdLocal(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;

      const isCustomerInv =
        params.resultInvoiceType === 'customer_invoice' && params.resultInvoiceId != null;
      const isTenant =
        params.resultInvoiceType === 'tenant_billing' && params.resultInvoiceId != null;

      if (isCustomerInv) {
        await upsertCycleRow(d, {
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
        await upsertCycleRow(d, {
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

      await upsertCycleRow(d, {
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
    /** Só para mismatch: só atualiza ciclo se o job for realmente obsoleto face à assinatura. */
    guardObsolete?: { subscriptionNextBillingYmd: string };
  }
): Promise<void> {
  await guardWrite(
    async (d) => {
      const cycleDate = normalizeBillingCycleKeyYmdLocal(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;

      if (params.guardObsolete) {
        const subNext = normalizeBillingCycleKeyYmdLocal(params.guardObsolete.subscriptionNextBillingYmd);
        if (subNext && subNext === cycleDate) {
          return;
        }
      }

      await upsertCycleRow(d, {
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
      const cycleDate = normalizeBillingCycleKeyYmdLocal(params.cycleKey) || params.cycleKey;
      if (!cycleDate || !/^\d{4}-\d{2}-\d{2}$/.test(cycleDate)) return;
      if (params.finalFailure) {
        await upsertCycleRow(d, {
          tenantId: params.tenantId,
          subscriptionId: params.subscriptionId,
          cycleDate,
          status: 'failed',
          jobId: params.jobId,
          invoiceId: null,
          processedAt: true,
          skippedReason: OUTCOME_FAILED_MAX,
          errorMessage: params.errorMessage.slice(0, 4000),
          extraMeta: { final_failure: true },
        });
      } else {
        await upsertCycleRow(d, {
          tenantId: params.tenantId,
          subscriptionId: params.subscriptionId,
          cycleDate,
          status: 'queued',
          jobId: params.jobId,
          invoiceId: null,
          processedAt: false,
          skippedReason: null,
          errorMessage: params.errorMessage.slice(0, 4000),
          extraMeta: { retry_scheduled: true },
        });
      }
    },
    db,
    'job_failed_attempt'
  );
}
