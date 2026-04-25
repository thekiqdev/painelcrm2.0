/**
 * Billing Engine: scheduler (enfileirar jobs) e worker (processar jobs).
 * Scheduler: assinaturas ativas em que (next_billing_date − dias de antecipação do tenant) ≤ CURRENT_DATE,
 * depois janela horária local (Fase 2). cycle_key = vencimento do ciclo; due_date da fatura = mesmo dia.
 * Worker: SELECT jobs FOR UPDATE SKIP LOCKED LIMIT 100; validar subscription; criar fatura; gateway; atualizar subscription e job.
 */
import crypto from 'node:crypto';
import { pool, dbRequestStorage, withBillingWorkerRlsBypass } from '../utils/db.js';

import { billingLog, notifyBillingJobFailed } from './billingLogger.js';
import {
  changeSubscriptionPlan,
  getSubscriptionById,
  updateSubscriptionAfterRenewal,
  expireCancelledSubscriptions,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import {
  createInvoice,
  updateInvoiceGatewayData,
  findInvoiceBySubscriptionAndPeriod,
  type CreateInvoiceInput,
} from './invoiceService.js';
import { schedulePublishPlatformBillingChargeCreated } from './platformNotifications/platformBusinessNotifications.js';
import {
  createCustomerInvoice,
  createChildCustomerInvoice,
  findCustomerInvoiceBySubscriptionAndPeriod,
  getCustomerInvoiceItems,
  type CustomerInvoiceItemRow,
  updateCustomerInvoiceGatewayData,
} from './customerInvoiceService.js';
import {
  getPaymentCustomerForClient,
  createPaymentCustomerForClient,
  deletePaymentCustomerForClient,
} from './paymentCustomersService.js';
import { isAsaasInvalidCustomerError } from '../modules/gateways/asaas/asaasErrors.js';
import { calculateInvoiceAmount, type BillingInterval } from './billingService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { resolveAutomaticInvoicePaymentMethod } from './gatewayPaymentMethodPolicy.js';
import { calculateNextBillingDate } from './subscriptionService.js';

/**
 * Próximo `next_billing_date` após concluir o ciclo `periodStart` (YYYY-MM-DD = `cycle_key` / `subscription_cycles.cycle_date`).
 * Usa sempre o **dia do próprio ciclo** (`billingAnchorDay = null` → `calculateNextBillingDate` toma o dia de `periodStart`),
 * não `subscriptions.billing_anchor_day`, para não desalinhar SaaS nem CRM (ex.: ciclo 24/04 → 24/05, não 10/05 por âncora antiga).
 * Não usa data atual nem due_date da fatura.
 */
function nextSubscriptionBillingAfterCycle(periodStartYmd: string, interval: BillingInterval): string {
  return calculateNextBillingDate(periodStartYmd, interval, null);
}
import {
  clampRecurringInvoiceGenerateDaysBeforeDue,
  computeRecurringInvoiceGenerationDateYmd,
} from '../utils/billingGenerationDate.js';
import {
  getBillingStaleProcessingReclaimMinutes,
  getChildBillingBatchLimit,
  isBillingSchedulerVerbose,
  isBillingTimeWindowVerbose,
  isChildItemInvoicesEnabled,
  shouldAlertNoInvoiceCycle,
} from '../config/billingEnv.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';
import { resolveMainRenewalItemDue } from './recurringCustomerRenewalItemDueAnchor.js';
import {
  buildBillingWindowDiagnostic,
  type BillingWindowDiagnostic,
  type BillingWindowReason,
} from './billingTimeWindowObservability.js';
import {
  subscriptionCyclesMarkProcessing,
  subscriptionCyclesMarkQueued,
  subscriptionCyclesOnJobCancelled,
  subscriptionCyclesOnJobCompleted,
  subscriptionCyclesOnJobFailedAttempt,
  subscriptionCyclesUpsertAfterScheduler,
} from './subscriptionCyclesDualWriteService.js';

const SCHEDULER_LIMIT = 500;
const WORKER_BATCH_SIZE = 100;

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
  /** Jobs pendentes cancelados após PATCH manual de next_billing_date (CRM). */
  CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE: 'cancelled_manual_next_billing_reschedule',
  /** Job obsoleto: `cycle_key` não coincide com `subscriptions.next_billing_date` após reagendamento. */
  CANCELLED_JOB_CYCLE_MISMATCH: 'cancelled_job_cycle_mismatch_after_reschedule',
  CANCELLED_AFTER_PERIOD_END: 'cancelled_after_period_end_at_cancel',
  CANCELLED_UNKNOWN_SUBSCRIPTION_TYPE: 'cancelled_unknown_subscription_type',
  FAILED_MAX_ATTEMPTS: 'failed_max_attempts',
} as const;

type DbQueryable = { query: (typeof pool)['query'] };
const WINDOW_REQUEUE_MINUTES = 15;

let billingJobOutcomeColumnsCache: boolean | undefined;

async function billingJobsTableHasOutcomeColumns(db: DbQueryable): Promise<boolean> {
  if (billingJobOutcomeColumnsCache !== undefined) return billingJobOutcomeColumnsCache;
  const r = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'billing_recurring_jobs'
       AND column_name = 'completion_outcome'`
  );
  billingJobOutcomeColumnsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return billingJobOutcomeColumnsCache;
}

async function completeBillingRecurringJob(
  db: DbQueryable,
  params: {
    jobId: string;
    resultInvoiceId: string | null;
    resultInvoiceType: 'tenant_billing' | 'customer_invoice' | null;
    outcome: string;
    detail?: string | null;
  }
): Promise<void> {
  const pre = await db.query<{
    subscription_id: string;
    tenant_id: string;
    cycle_key: string;
  }>(
    `SELECT subscription_id::text, tenant_id::text, cycle_key FROM billing_recurring_jobs WHERE id = $1::uuid`,
    [params.jobId]
  );
  const jobRow = pre.rows[0] ?? null;

  const has = await billingJobsTableHasOutcomeColumns(db);
  if (has) {
    await db.query(
      `UPDATE billing_recurring_jobs SET
        status = 'completed',
        result_invoice_id = $2,
        result_invoice_type = $3,
        completion_outcome = $4,
        completion_detail = $5,
        updated_at = now()
      WHERE id = $1`,
      [params.jobId, params.resultInvoiceId, params.resultInvoiceType, params.outcome, params.detail ?? null]
    );
  } else {
    await db.query(
      `UPDATE billing_recurring_jobs SET
        status = 'completed',
        result_invoice_id = $2,
        result_invoice_type = $3,
        updated_at = now()
      WHERE id = $1`,
      [params.jobId, params.resultInvoiceId, params.resultInvoiceType]
    );
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

async function cancelBillingRecurringJob(
  db: DbQueryable,
  jobId: string,
  outcome: string,
  detail?: string | null,
  /** Só preenchido em `CANCELLED_JOB_CYCLE_MISMATCH`: evita marcar ciclo cancelado se next_billing já alinhou ao ciclo do job. */
  subscriptionNextBillingYmdForMismatchGuard?: string | null
): Promise<void> {
  const pre = await db.query<{
    subscription_id: string;
    tenant_id: string;
    cycle_key: string;
  }>(
    `SELECT subscription_id::text, tenant_id::text, cycle_key FROM billing_recurring_jobs WHERE id = $1::uuid`,
    [jobId]
  );
  const jobRow = pre.rows[0] ?? null;

  const has = await billingJobsTableHasOutcomeColumns(db);
  if (has) {
    await db.query(
      `UPDATE billing_recurring_jobs SET
        status = 'cancelled',
        completion_outcome = $2,
        completion_detail = $3,
        updated_at = now()
      WHERE id = $1`,
      [jobId, outcome, detail ?? null]
    );
  } else {
    await db.query(`UPDATE billing_recurring_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1`, [jobId]);
  }
  billingLog('job', 'job_cancelled', { jobId, outcome, detail: detail ?? undefined });

  if (jobRow) {
    const guardNext =
      subscriptionNextBillingYmdForMismatchGuard != null
        ? String(subscriptionNextBillingYmdForMismatchGuard).trim().slice(0, 10)
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

async function requeueBillingRecurringJobForWindow(
  db: DbQueryable,
  params: { jobId: string; retryAt: Date }
): Promise<void> {
  await db.query(
    `UPDATE billing_recurring_jobs
     SET status = 'pending',
         retry_at = $2,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [params.jobId, params.retryAt.toISOString()]
  );
  await subscriptionCyclesMarkQueued(db, params.jobId);
}

function buildWindowRequeueAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + WINDOW_REQUEUE_MINUTES * 60_000);
}

type CustomerItemRecurringInterval =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'yearly';

function calculateNextItemDueDate(periodStart: string, interval: CustomerItemRecurringInterval): string {
  const d = new Date(periodStart + 'T12:00:00Z');
  const anchorDay = d.getUTCDate();

  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();

  switch (interval) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    case 'monthly':
      m += 1;
      break;
    case 'quarterly':
      m += 3;
      break;
    case 'semi_annual':
      m += 6;
      break;
    case 'yearly':
      y += 1;
      break;
    default:
      m += 1;
  }

  if (m > 11) {
    y += Math.floor(m / 12);
    m = m % 12;
  }

  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  const next = new Date(Date.UTC(y, m, day));

  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Linha mínima (subscription + tenant) para enfileirar job de renovação com janela Fase 2. */
export type RenewalEnqueueTenantJoinRow = {
  id: string;
  tenant_id: string;
  next_billing_date: string;
  tenant_timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  /** Dias antes do vencimento do ciclo para permitir enfileiramento (0 = no dia do vencimento). */
  recurring_invoice_generate_days_before_due: number;
};

function schedulerCycleSchedulingMeta(
  row: RenewalEnqueueTenantJoinRow,
  cycleYmd: string
): Record<string, unknown> {
  const generate_days_before_due = clampRecurringInvoiceGenerateDaysBeforeDue(
    row.recurring_invoice_generate_days_before_due
  );
  return {
    cycle_due_date: cycleYmd,
    generate_days_before_due,
    generation_date: computeRecurringInvoiceGenerationDateYmd(cycleYmd, generate_days_before_due),
  };
}

export function normalizeSubscriptionNextBillingYmd(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

const YMD_STRICT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formato canónico persistido em `billing_recurring_jobs.cycle_key`: **YYYY-MM-DD** (texto).
 * Legado: valores com sufixo ISO (`…T00:00:00.000-03:00`) representam o mesmo dia lógico.
 */
export function normalizeBillingCycleKeyYmd(raw: string | null | undefined): string {
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

/**
 * Predicado SQL: coluna `cycle_key` corresponde ao ciclo canónico `$2` (YYYY-MM-DD), incluindo legado `YYYY-MM-DDTHH…` ou `YYYY-MM-DD HH…`.
 * Bindings: `$1` = subscription_id, `$2` = cycle_key canónico.
 */
export const BILLING_JOBS_WHERE_SAME_LOGICAL_CYCLE = `subscription_id = $1 AND (
  cycle_key = $2
  OR (
    length(cycle_key) > 10
    AND left(cycle_key, 10) = $2
    AND (substring(cycle_key, 11, 1) IN ('T', 't', ' '))
  )
)`;

/** $1 subscription_id, $2 tenant_id, $3 cycle_key canónico YYYY-MM-DD (insight / contagens). */
export const BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE = `subscription_id = $1 AND tenant_id = $2 AND (
  cycle_key = $3
  OR (
    length(cycle_key) > 10
    AND left(cycle_key, 10) = $3
    AND (substring(cycle_key, 11, 1) IN ('T', 't', ' '))
  )
)`;

type InsertOrReactivateRenewalJobResult =
  | 'inserted'
  | 'reactivated'
  | 'skipped_active_exists'
  | 'skipped_completed_cycle';

/**
 * Jobs em `processing` com lock antigo (worker morto / crash) voltam a `pending` para serem elegíveis no batch.
 * Config: `BILLING_WORKER_STALE_PROCESSING_RECLAIM_MINUTES` (default 20; `0` desliga).
 */
async function reclaimStaleBillingProcessingJobs(db: DbQueryable, workerId: string): Promise<number> {
  const minutes = getBillingStaleProcessingReclaimMinutes();
  if (minutes <= 0) return 0;
  const r = await db.query<{ id: string }>(
    `UPDATE billing_recurring_jobs
     SET status = 'pending',
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE status = 'processing'
       AND (
         (locked_at IS NOT NULL AND locked_at < now() - ($1::int * INTERVAL '1 minute'))
         OR (locked_at IS NULL AND updated_at < now() - ($1::int * INTERVAL '1 minute'))
       )
     RETURNING id::text AS id`,
    [minutes]
  );
  const n = r.rowCount ?? 0;
  if (n > 0) {
    billingLog('worker', 'stale_processing_reclaimed', {
      workerId,
      reclaimed_count: n,
      reclaim_minutes: minutes,
      reclaimed_job_ids_json: JSON.stringify(r.rows.map((x) => x.id)),
    });
    for (const row of r.rows) {
      await subscriptionCyclesMarkQueued(db, row.id);
    }
  }
  return n;
}

/** `pending` não deve manter lock de um `processing` interrompido; limpa estado legado / bug de retry. */
async function sanitizePendingBillingJobLocks(db: DbQueryable, workerId: string): Promise<number> {
  const r = await db.query<{ id: string }>(
    `UPDATE billing_recurring_jobs
     SET locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE status = 'pending'
       AND (locked_at IS NOT NULL OR locked_by IS NOT NULL)
     RETURNING id::text AS id`
  );
  const n = r.rowCount ?? 0;
  if (n > 0) {
    billingLog('worker', 'pending_orphan_locks_cleared', {
      workerId,
      cleared_count: n,
      job_ids_json: JSON.stringify(r.rows.map((x) => x.id)),
    });
  }
  return n;
}

/**
 * Garante um job `pending` para o ciclo `next_billing_date` sem duplicar pending/processing.
 * Reativa linhas `cancelled`/`failed` do mesmo `cycle_key` (evita ON CONFLICT DO NOTHING bloquear para sempre).
 */
export async function insertOrReactivateRenewalJob(
  db: DbQueryable,
  row: RenewalEnqueueTenantJoinRow
): Promise<InsertOrReactivateRenewalJobResult> {
  const subscriptionId = row.id;
  const tenantId = row.tenant_id;
  const cycleKeyCanonical =
    normalizeBillingCycleKeyYmd(row.next_billing_date) || normalizeSubscriptionNextBillingYmd(row.next_billing_date);

  const activeR = await db.query<{
    id: string;
    cycle_key: string;
    status: string;
    scheduled_at: string;
    retry_at: string | null;
    locked_at: string | null;
  }>(
    `SELECT id::text, cycle_key, status, scheduled_at::text, retry_at::text, locked_at::text
     FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE} AND status IN ('pending', 'processing')
     LIMIT 5`,
    [subscriptionId, tenantId, cycleKeyCanonical]
  );
  if (activeR.rows.length > 0) {
    if (activeR.rows.length > 1) {
      billingLog('scheduler', 'enqueue_warn_multiple_active_same_logical_cycle', {
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        cycle_key_canonical: cycleKeyCanonical,
        job_ids_json: JSON.stringify(activeR.rows.map((r) => r.id)),
        cycle_keys_raw_json: JSON.stringify(activeR.rows.map((r) => r.cycle_key)),
      });
    }
    billingLog('scheduler', 'enqueue_skipped_insert_guard', {
      subscription_id: subscriptionId,
      tenant_id: tenantId,
      cycle_key_canonical: cycleKeyCanonical,
      insert_guard: 'skipped_active_exists',
      blocking_jobs_json: JSON.stringify(activeR.rows),
    });
    await subscriptionCyclesUpsertAfterScheduler(db, {
      tenantId,
      subscriptionId,
      cycleKeyCanonical,
      jobId: activeR.rows[0].id,
      schedulingMeta: schedulerCycleSchedulingMeta(row, cycleKeyCanonical),
    });
    return 'skipped_active_exists';
  }

  const existingR = await db.query<{ id: string; status: string; cycle_key: string }>(
    `SELECT id, status, cycle_key FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
     ORDER BY updated_at DESC
     LIMIT 1`,
    [subscriptionId, tenantId, cycleKeyCanonical]
  );
  const ex = existingR.rows[0];
  const has = await billingJobsTableHasOutcomeColumns(db);

  if (ex) {
    if (ex.status === 'cancelled' || ex.status === 'failed') {
      if (has) {
        await db.query(
          `UPDATE billing_recurring_jobs SET
            status = 'pending',
            cycle_key = $1,
            scheduled_at = ($2::date)::timestamptz,
            retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            error_message = NULL,
            completion_outcome = NULL,
            completion_detail = NULL,
            result_invoice_id = NULL,
            result_invoice_type = NULL,
            attempts = 0,
            updated_at = now()
           WHERE id = $3`,
          [cycleKeyCanonical, cycleKeyCanonical, ex.id]
        );
      } else {
        await db.query(
          `UPDATE billing_recurring_jobs SET
            status = 'pending',
            cycle_key = $1,
            scheduled_at = ($2::date)::timestamptz,
            retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            error_message = NULL,
            result_invoice_id = NULL,
            result_invoice_type = NULL,
            attempts = 0,
            updated_at = now()
           WHERE id = $3`,
          [cycleKeyCanonical, cycleKeyCanonical, ex.id]
        );
      }
      billingLog('scheduler', 'enqueue_job_reactivated_stale_cycle', {
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        cycle_key_canonical: cycleKeyCanonical,
        prior_cycle_key_raw: ex.cycle_key,
        prior_status: ex.status,
      });
      await subscriptionCyclesUpsertAfterScheduler(db, {
        tenantId,
        subscriptionId,
        cycleKeyCanonical,
        jobId: ex.id,
        schedulingMeta: schedulerCycleSchedulingMeta(row, cycleKeyCanonical),
      });
      return 'reactivated';
    }
    if (ex.status === 'completed') {
      if (isBillingSchedulerVerbose()) {
        billingLog('scheduler', 'enqueue_skipped_completed_cycle_exists', {
          subscription_id: subscriptionId,
          tenant_id: tenantId,
          cycle_key_canonical: cycleKeyCanonical,
          matched_cycle_key_raw: ex.cycle_key,
        });
      }
      return 'skipped_completed_cycle';
    }
    return 'skipped_active_exists';
  }

  try {
    const insR = await db.query<{ id: string }>(
      `INSERT INTO billing_recurring_jobs (subscription_id, tenant_id, job_type, cycle_key, scheduled_at, status)
       VALUES ($1, $2, 'renewal', $3, ($4::date)::timestamptz, 'pending')
       RETURNING id::text`,
      [subscriptionId, tenantId, cycleKeyCanonical, cycleKeyCanonical]
    );
    const newJobId = insR.rows[0]?.id ?? null;
    if (newJobId) {
      await subscriptionCyclesUpsertAfterScheduler(db, {
        tenantId,
        subscriptionId,
        cycleKeyCanonical,
        jobId: newJobId,
        schedulingMeta: schedulerCycleSchedulingMeta(row, cycleKeyCanonical),
      });
    }
    return 'inserted';
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code !== '23505') throw e;
    const afterR = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM billing_recurring_jobs
       WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
       LIMIT 1`,
      [subscriptionId, tenantId, cycleKeyCanonical]
    );
    const rowAfter = afterR.rows[0];
    if (rowAfter?.status === 'pending' || rowAfter?.status === 'processing') {
      await subscriptionCyclesUpsertAfterScheduler(db, {
        tenantId,
        subscriptionId,
        cycleKeyCanonical,
        jobId: rowAfter.id,
        schedulingMeta: schedulerCycleSchedulingMeta(row, cycleKeyCanonical),
      });
      return 'skipped_active_exists';
    }
    if (rowAfter?.status === 'completed') {
      return 'skipped_completed_cycle';
    }
    return 'skipped_active_exists';
  }
}

/** Resultado só-leitura de `insertOrReactivateRenewalJob` (sem INSERT/UPDATE). */
export async function predictInsertOrReactivateRenewalJob(
  db: DbQueryable,
  row: RenewalEnqueueTenantJoinRow
): Promise<InsertOrReactivateRenewalJobResult> {
  const subscriptionId = row.id;
  const tenantId = row.tenant_id;
  const cycleKeyCanonical =
    normalizeBillingCycleKeyYmd(row.next_billing_date) || normalizeSubscriptionNextBillingYmd(row.next_billing_date);

  const activeR = await db.query<{ id: string }>(
    `SELECT id FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE} AND status IN ('pending', 'processing')
     LIMIT 1`,
    [subscriptionId, tenantId, cycleKeyCanonical]
  );
  if (activeR.rows.length > 0) {
    return 'skipped_active_exists';
  }

  const existingR = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
     ORDER BY updated_at DESC
     LIMIT 1`,
    [subscriptionId, tenantId, cycleKeyCanonical]
  );
  const ex = existingR.rows[0];

  if (ex) {
    if (ex.status === 'cancelled' || ex.status === 'failed') {
      return 'reactivated';
    }
    if (ex.status === 'completed') {
      return 'skipped_completed_cycle';
    }
    return 'skipped_active_exists';
  }

  return 'inserted';
}

export type TryEnqueueRenewalReason =
  | 'subscription_not_found'
  | 'subscription_not_active'
  | 'subscription_type_unsupported'
  | 'next_billing_after_db_today'
  /** Fase 2: `next_billing_date` no calendário local do tenant é futuro em relação a “hoje” local. */
  | 'future_local_date'
  /** Fase 2: mesmo dia local, mas ainda antes de `recurring_generate_time_local`. */
  | 'too_early_local_time'
  /** Reservado para estados inesperados de janela (não deve ocorrer com a Fase 2 atual). */
  | 'outside_local_window'
  | 'active_job_exists'
  | 'completed_cycle_guard';

export type TryEnqueueRenewalJobForSubscriptionResult =
  | { ok: true; mode: 'inserted' | 'reactivated' }
  | { ok: false; reason: TryEnqueueRenewalReason; window_reason?: BillingWindowReason };

function tryEnqueueReasonFromIneligibleWindow(diag: BillingWindowDiagnostic): TryEnqueueRenewalReason {
  if (diag.reason === 'too_early_local_time') return 'too_early_local_time';
  if (diag.reason === 'future_local_date') return 'future_local_date';
  return 'outside_local_window';
}

/** Texto curto para operação / UI (insight) — mesma taxonomia que `TryEnqueueRenewalReason`. */
export function renewalEnqueueBlockReasonMessagePt(reason: TryEnqueueRenewalReason): string {
  const m: Record<TryEnqueueRenewalReason, string> = {
    subscription_not_found: 'Assinatura não encontrada.',
    subscription_not_active: 'Assinatura não está ativa.',
    subscription_type_unsupported: 'Tipo de assinatura não suportado para renovação automática.',
    next_billing_after_db_today:
      'A data de geração (próxima cobrança menos dias de antecipação) é posterior a CURRENT_DATE no PostgreSQL — o scheduler ainda não considera esta assinatura elegível pelo filtro SQL. Depois de um ciclo processado, a assinatura avança para o próximo vencimento.',
    future_local_date:
      'No fuso do tenant, ainda não chegou o primeiro dia civil de geração (vencimento do ciclo menos dias de antecipação) — aguardar o dia local ou ajustar configuração.',
    too_early_local_time:
      'Mesmo dia local, mas ainda antes do horário de geração configurado no tenant (Fase 2).',
    outside_local_window: 'Fora da janela local de geração (Fase 2).',
    active_job_exists: 'Já existe job pendente ou em processamento para este ciclo (cycle_key).',
    completed_cycle_guard: 'Ciclo já consta como concluído na tabela de jobs — não reabre completed.',
  };
  return m[reason] ?? reason;
}

export type RenewalEnqueueDescription = {
  subscription_id: string;
  cycle_key: string | null;
  db_eligible: boolean;
  window_eligible: boolean;
  window_reason: BillingWindowReason | null;
  window_diagnostic: BillingWindowDiagnostic | null;
  /** Resultado previsto de `insertOrReactivateRenewalJob` (só-leitura). */
  predicted_insert: InsertOrReactivateRenewalJobResult | null;
  /** Linha mínima para enfileirar quando `db_eligible` e `window_eligible`. */
  enqueue_row: RenewalEnqueueTenantJoinRow | null;
  can_attempt_insert: boolean;
  block_reason: TryEnqueueRenewalReason | null;
  /** Quando `block_reason === 'active_job_exists'`: jobs que bloqueiam (mesmo ciclo lógico). */
  active_blocking_jobs?: { id: string; cycle_key: string; status: string }[];
};

/**
 * Descreve por que um job de renovação seria ou não enfileirado agora (scheduler / PATCH / insight).
 * Não altera dados. Usar `db` do mesmo contexto RLS/bypass que `tryEnqueue` (ex.: `pool` dentro de `withBillingWorkerRlsBypass`).
 */
export async function describeRenewalEnqueueWithDb(
  db: DbQueryable,
  subscriptionId: string
): Promise<RenewalEnqueueDescription> {
  const base: RenewalEnqueueDescription = {
    subscription_id: subscriptionId,
    cycle_key: null,
    db_eligible: false,
    window_eligible: false,
    window_reason: null,
    window_diagnostic: null,
    predicted_insert: null,
    enqueue_row: null,
    can_attempt_insert: false,
    block_reason: 'subscription_not_found',
    active_blocking_jobs: undefined,
  };

  const r = await db.query<
    RenewalEnqueueTenantJoinRow & {
      status: string;
      type: string;
    }
  >(
    `SELECT s.id, s.tenant_id, s.next_billing_date::text, s.status, s.type,
            t.timezone::text AS tenant_timezone,
            t.recurring_generate_time_local::text,
            t.invoice_notify_same_as_generation,
            t.invoice_notify_time_local::text,
            COALESCE(t.recurring_invoice_generate_days_before_due, 0)::int AS recurring_invoice_generate_days_before_due
     FROM subscriptions s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = $1
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row) {
    return { ...base, block_reason: 'subscription_not_found' };
  }
  const canonicalYmd = normalizeBillingCycleKeyYmd(row.next_billing_date) || row.next_billing_date;

  if (row.status !== 'active') {
    return { ...base, cycle_key: canonicalYmd, block_reason: 'subscription_not_active' };
  }
  if (row.type !== 'customer' && row.type !== 'saas') {
    return { ...base, cycle_key: canonicalYmd, block_reason: 'subscription_type_unsupported' };
  }

  const eligibleR = await db.query<{ ok: boolean }>(
    `SELECT (
       (s.next_billing_date - COALESCE(t.recurring_invoice_generate_days_before_due, 0)) <= CURRENT_DATE
     ) AS ok
     FROM subscriptions s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = $1`,
    [subscriptionId]
  );
  const dbOk = !!eligibleR.rows[0]?.ok;
  if (!dbOk) {
    return {
      ...base,
      cycle_key: canonicalYmd,
      db_eligible: false,
      block_reason: 'next_billing_after_db_today',
    };
  }

  const diag = buildBillingWindowDiagnostic({
    tenantTimezoneRaw: row.tenant_timezone ?? null,
    recurringGenerateTimeLocalRaw: row.recurring_generate_time_local ?? null,
    invoiceNotifySameAsGenerationRaw: row.invoice_notify_same_as_generation ?? null,
    invoiceNotifyTimeLocalRaw: row.invoice_notify_time_local ?? null,
    nextBillingDate: canonicalYmd,
    recurringInvoiceGenerateDaysBeforeDue: row.recurring_invoice_generate_days_before_due,
  });

  const joinRow: RenewalEnqueueTenantJoinRow = {
    id: row.id,
    tenant_id: row.tenant_id,
    next_billing_date: canonicalYmd,
    tenant_timezone: row.tenant_timezone,
    recurring_generate_time_local: row.recurring_generate_time_local,
    invoice_notify_same_as_generation: row.invoice_notify_same_as_generation,
    invoice_notify_time_local: row.invoice_notify_time_local,
    recurring_invoice_generate_days_before_due: row.recurring_invoice_generate_days_before_due,
  };

  if (!diag.would_be_eligible_by_window) {
    return {
      ...base,
      cycle_key: canonicalYmd,
      db_eligible: true,
      window_eligible: false,
      window_reason: diag.reason,
      window_diagnostic: diag,
      enqueue_row: joinRow,
      block_reason: tryEnqueueReasonFromIneligibleWindow(diag),
    };
  }

  const predicted = await predictInsertOrReactivateRenewalJob(db, joinRow);
  let block_reason: TryEnqueueRenewalReason | null = null;
  if (predicted === 'skipped_active_exists') block_reason = 'active_job_exists';
  else if (predicted === 'skipped_completed_cycle') block_reason = 'completed_cycle_guard';

  let active_blocking_jobs: RenewalEnqueueDescription['active_blocking_jobs'] = undefined;
  if (block_reason === 'active_job_exists') {
    const ab = await db.query<{ id: string; cycle_key: string; status: string }>(
      `SELECT id::text, cycle_key, status FROM billing_recurring_jobs
       WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE} AND status IN ('pending', 'processing')
       ORDER BY updated_at ASC
       LIMIT 10`,
      [subscriptionId, row.tenant_id, canonicalYmd]
    );
    active_blocking_jobs = ab.rows;
  }

  return {
    subscription_id: subscriptionId,
    cycle_key: canonicalYmd,
    db_eligible: true,
    window_eligible: true,
    window_reason: diag.reason,
    window_diagnostic: diag,
    predicted_insert: predicted,
    enqueue_row: joinRow,
    can_attempt_insert: block_reason === null,
    block_reason,
    ...(active_blocking_jobs && active_blocking_jobs.length > 0 ? { active_blocking_jobs } : {}),
  };
}

/**
 * Descreve enfileiramento (versão pública com bypass RLS de billing).
 */
export async function describeRenewalEnqueueForSubscriptionId(
  subscriptionId: string
): Promise<RenewalEnqueueDescription> {
  return withBillingWorkerRlsBypass(() => describeRenewalEnqueueWithDb(pool, subscriptionId));
}

/**
 * Tenta enfileirar um job de renovação para uma assinatura já elegível (mesma lógica do scheduler: CURRENT_DATE + janela local).
 * Usado após PATCH de `next_billing_date` para não depender apenas do próximo tick do cron.
 */
export async function tryEnqueueRenewalJobForSubscriptionId(
  subscriptionId: string
): Promise<TryEnqueueRenewalJobForSubscriptionResult> {
  return withBillingWorkerRlsBypass(async () => {
    const desc = await describeRenewalEnqueueWithDb(pool, subscriptionId);
    if (desc.block_reason) {
      const wr = desc.window_diagnostic?.reason;
      return {
        ok: false,
        reason: desc.block_reason,
        ...(wr && !desc.window_eligible ? { window_reason: wr } : {}),
      };
    }
    if (!desc.enqueue_row) {
      return { ok: false, reason: 'subscription_not_found' };
    }

    const outcome = await insertOrReactivateRenewalJob(pool, desc.enqueue_row);
    if (outcome === 'inserted' || outcome === 'reactivated') {
      billingLog('scheduler', 'enqueue_after_next_billing_manual_patch', {
        subscription_id: subscriptionId,
        tenant_id: desc.enqueue_row.tenant_id,
        mode: outcome,
        ...(desc.predicted_insert != null ? { predicted_mode: desc.predicted_insert } : {}),
      });
      return { ok: true, mode: outcome };
    }
    if (outcome === 'skipped_active_exists') return { ok: false, reason: 'active_job_exists' };
    return { ok: false, reason: 'completed_cycle_guard' };
  });
}

/**
 * Scheduler: candidatos em que a data de geração (next_billing_date − antecipação do tenant) ≤ CURRENT_DATE;
 * depois `buildBillingWindowDiagnostic` (calendário + horário local). cycle_key = next_billing_date (vencimento do ciclo).
 * LIMIT 500 por execução. Também expira assinaturas com cancel_at_period_end e current_period_end < hoje.
 */
export async function enqueueRenewalJobs(): Promise<{ enqueued: number; skipped: number; expired: number }> {
  return withBillingWorkerRlsBypass(async () => {
    const expired = await expireCancelledSubscriptions();

    const subs = await pool.query<{
      id: string;
      tenant_id: string;
      next_billing_date: string;
      tenant_timezone: string | null;
      recurring_generate_time_local: string | null;
      invoice_notify_same_as_generation: boolean | null;
      invoice_notify_time_local: string | null;
      recurring_invoice_generate_days_before_due: number;
    }>(
      `SELECT s.id, s.tenant_id, s.next_billing_date, t.timezone::text AS tenant_timezone,
              t.recurring_generate_time_local::text,
              t.invoice_notify_same_as_generation,
              t.invoice_notify_time_local::text,
              COALESCE(t.recurring_invoice_generate_days_before_due, 0)::int AS recurring_invoice_generate_days_before_due
       FROM subscriptions s
       LEFT JOIN tenants t ON t.id = s.tenant_id
       WHERE s.status = 'active'
         AND (s.next_billing_date - COALESCE(t.recurring_invoice_generate_days_before_due, 0)) <= CURRENT_DATE
       ORDER BY s.next_billing_date
       LIMIT $1`,
      [SCHEDULER_LIMIT]
    );

    let enqueued = 0;
    let skipped = 0;
    let diagnosticEligible = 0;
    let diagnosticTooEarly = 0;
    let diagnosticFutureDate = 0;
    let diagnosticFallbackTimezone = 0;
    const enqueuedSample: { subscription_id: string; tenant_id: string; cycle_key: string }[] = [];

    billingLog('scheduler', 'enqueue_run', { total_candidates: subs.rows.length, expired });
    for (const row of subs.rows) {
      const cycleKey =
        normalizeBillingCycleKeyYmd(row.next_billing_date) || normalizeSubscriptionNextBillingYmd(row.next_billing_date);
      const diag = buildBillingWindowDiagnostic({
        tenantTimezoneRaw: row.tenant_timezone ?? null,
        recurringGenerateTimeLocalRaw: row.recurring_generate_time_local ?? null,
        invoiceNotifySameAsGenerationRaw: row.invoice_notify_same_as_generation ?? null,
        invoiceNotifyTimeLocalRaw: row.invoice_notify_time_local ?? null,
        nextBillingDate: cycleKey,
        recurringInvoiceGenerateDaysBeforeDue: row.recurring_invoice_generate_days_before_due,
      });
      if (diag.would_be_eligible_by_window) diagnosticEligible++;
      if (diag.reason === 'too_early_local_time') diagnosticTooEarly++;
      if (diag.reason === 'future_local_date') diagnosticFutureDate++;
      if (diag.fallback_applied) diagnosticFallbackTimezone++;

      if (!diag.would_be_eligible_by_window) {
        skipped++;
        billingLog('scheduler', 'time_window_scheduler_skip_outside_window', {
          tenant_id: row.tenant_id,
          subscription_id: row.id,
          next_billing_date: row.next_billing_date,
          timezone_effective: diag.timezone_effective,
          timezone_source: diag.timezone_source,
          fallback_applied: diag.fallback_applied,
          generate_time_local_effective: diag.generate_time_local_effective,
          would_be_eligible_by_window: diag.would_be_eligible_by_window,
          window_reason: diag.reason,
          phase: 'active_window_phase2',
          ...(isBillingTimeWindowVerbose()
            ? {
                tenant_timezone: diag.tenant_timezone_raw ?? undefined,
                timezone_valid: diag.timezone_valid,
                local_now_ymd: diag.local_now_ymd,
                local_now_hhmm: diag.local_now_hhmm,
                generate_time_source: diag.generate_time_source,
              }
            : {}),
        });
        continue;
      }

      if (isBillingTimeWindowVerbose()) {
        billingLog('scheduler', 'time_window_scheduler_eligible', {
          tenant_id: row.tenant_id,
          subscription_id: row.id,
          next_billing_date: row.next_billing_date,
          timezone_effective: diag.timezone_effective,
          timezone_source: diag.timezone_source,
          fallback_applied: diag.fallback_applied,
          generate_time_local_effective: diag.generate_time_local_effective,
          would_be_eligible_by_window: diag.would_be_eligible_by_window,
          window_reason: diag.reason,
          phase: 'active_window_phase2',
          tenant_timezone: diag.tenant_timezone_raw ?? undefined,
          timezone_valid: diag.timezone_valid,
          local_now_ymd: diag.local_now_ymd,
          local_now_hhmm: diag.local_now_hhmm,
          generate_time_source: diag.generate_time_source,
        });
      }

      const joinRow: RenewalEnqueueTenantJoinRow = {
        id: row.id,
        tenant_id: row.tenant_id,
        next_billing_date: cycleKey,
        tenant_timezone: row.tenant_timezone,
        recurring_generate_time_local: row.recurring_generate_time_local,
        invoice_notify_same_as_generation: row.invoice_notify_same_as_generation,
        invoice_notify_time_local: row.invoice_notify_time_local,
        recurring_invoice_generate_days_before_due: row.recurring_invoice_generate_days_before_due,
      };
      const ins = await insertOrReactivateRenewalJob(pool, joinRow);
      if (ins === 'skipped_active_exists') {
        skipped++;
        if (isBillingSchedulerVerbose()) {
          billingLog('scheduler', 'enqueue_skipped_pending_job_exists', {
            subscription_id: row.id,
            tenant_id: row.tenant_id,
            cycle_key: cycleKey,
          });
        }
        continue;
      }
      if (ins === 'skipped_completed_cycle') {
        skipped++;
        billingLog('scheduler', 'enqueue_skipped_insert_guard', {
          subscription_id: row.id,
          tenant_id: row.tenant_id,
          cycle_key_canonical: cycleKey,
          insert_guard: 'skipped_completed_cycle',
        });
        if (isBillingSchedulerVerbose()) {
          billingLog('scheduler', 'enqueue_skipped_conflict_or_duplicate', {
            subscription_id: row.id,
            tenant_id: row.tenant_id,
            cycle_key: cycleKey,
          });
        }
        continue;
      }
      enqueued++;
      if (enqueuedSample.length < 15) {
        enqueuedSample.push({ subscription_id: row.id, tenant_id: row.tenant_id, cycle_key: cycleKey });
      }
      if (isBillingSchedulerVerbose() && ins === 'inserted') {
        billingLog('scheduler', 'enqueue_job_inserted', {
          subscription_id: row.id,
          tenant_id: row.tenant_id,
          cycle_key: cycleKey,
        });
      }
    }

    billingLog('scheduler', 'enqueue_done', {
      enqueued,
      skipped,
      expired,
      diagnostic_eligible_by_window: diagnosticEligible,
      diagnostic_too_early_local_time: diagnosticTooEarly,
      diagnostic_future_local_date: diagnosticFutureDate,
      diagnostic_fallback_timezone_used: diagnosticFallbackTimezone,
      enqueued_sample_json: JSON.stringify(enqueuedSample),
      scheduler_verbose: isBillingSchedulerVerbose(),
      time_window_verbose: isBillingTimeWindowVerbose(),
      phase: 'active_window_phase2',
    });
    return { enqueued, skipped, expired };
  });
}

export interface JobRow {
  id: string;
  subscription_id: string;
  tenant_id: string;
  job_type: string;
  cycle_key: string;
  scheduled_at: string;
  retry_at: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
}

/**
 * Data base do ciclo em processamento: prioriza `job.cycle_key` (o que o scheduler enfileirou),
 * com fallback à assinatura. Não usa `now()` nem due_date da fatura.
 */
function resolveWorkerJobCycleStartYmd(job: JobRow, subscription: SubscriptionRow): string {
  const fromJob = normalizeBillingCycleKeyYmd(job.cycle_key);
  if (fromJob && YMD_STRICT.test(fromJob)) return fromJob;
  const fromSub =
    normalizeBillingCycleKeyYmd(String(subscription.next_billing_date ?? '').trim()) ||
    normalizeSubscriptionNextBillingYmd(subscription.next_billing_date);
  if (fromSub && YMD_STRICT.test(fromSub)) return fromSub;
  throw new Error(
    `Ciclo do job inválido: cycle_key=${job.cycle_key} subscription.next_billing_date=${subscription.next_billing_date}`
  );
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

/**
 * Decisão pura (testável) do próximo `next_billing_date` após concluir o ciclo `cycleDateYmd`.
 * Base: `addInterval(cycle_date, billing_interval)` com `calculateNextBillingDate(..., null)` — sem due_date, CURRENT_DATE, now(), nem âncora antiga.
 */
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
    normalizeBillingCycleKeyYmd(params.cycleDateYmd) || String(params.cycleDateYmd).trim().slice(0, 10);
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

/**
 * Único caminho de escrita de `subscriptions.next_billing_date` após ciclo bem-sucedido no worker.
 * Lê a assinatura no BD com `FOR UPDATE` (valor fresco + lock; evita merge com objeto stale do início do job).
 */
async function advanceSubscriptionAfterCompletedCycle(
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
  const subR = await db.query<{
    billing_interval: string;
    next_billing_date: string;
    billing_cycle_count: number;
  }>(
    `SELECT billing_interval::text, next_billing_date::text, billing_cycle_count::int
     FROM subscriptions
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     FOR UPDATE`,
    [params.subscriptionId, params.tenantId]
  );
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

  await updateSubscriptionAfterRenewal(db, params.subscriptionId, params.tenantId, {
    next_billing_date: decision.finalNextYmd,
    current_period_start: decision.cycleDate,
    current_period_end: decision.finalNextYmd,
    billing_cycle_count: nextCount,
  });
}

/**
 * Worker: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Valida subscription (active, janela local de geração antecipada, cancel_at_period_end); cria fatura; chama gateway; atualiza subscription (last_job_at, next_billing_date, etc.) e job.
 */
export async function processNextBatch(workerId: string): Promise<{ processed: number; failed: number; cancelled: number }> {
  return withBillingWorkerRlsBypass(async () => {
    const client = dbRequestStorage.getStore()?.client;
    if (!client) {
      throw new Error('billing worker RLS context missing');
    }
    const result = { processed: 0, failed: 0, cancelled: 0 };

    await reclaimStaleBillingProcessingJobs(client, workerId);
    await sanitizePendingBillingJobLocks(client, workerId);

    const jobsResult = await client.query<JobRow>(
      `SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
       FROM billing_recurring_jobs
       WHERE status = 'pending'
         AND scheduled_at <= now()
         AND (retry_at IS NULL OR retry_at <= now())
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [WORKER_BATCH_SIZE]
    );
    const jobs = jobsResult.rows;
    if (jobs.length === 0) {
      const backoffR = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM billing_recurring_jobs
         WHERE status = 'pending'
           AND scheduled_at <= now()
           AND retry_at IS NOT NULL
           AND retry_at > now()`
      );
      const backoffCount = parseInt(backoffR.rows[0]?.c ?? '0', 10);
      if (backoffCount > 0) {
        const nextR = await client.query<{ t: string }>(
          `SELECT min(retry_at)::text AS t FROM billing_recurring_jobs
           WHERE status = 'pending'
             AND scheduled_at <= now()
             AND retry_at IS NOT NULL
             AND retry_at > now()`
        );
        billingLog('worker', 'batch_empty_retry_backoff', {
          workerId,
          pending_in_backoff: backoffCount,
          next_retry_at_earliest: nextR.rows[0]?.t ?? null,
          hint_pt:
            'Jobs em pending aguardam retry_at após falha (ver error_message). Scheduler não duplica fila.',
        });
      }
    }
    billingLog('worker', 'batch_start', { workerId, batchSize: jobs.length });

    for (const job of jobs) {
      await client.query(
        `UPDATE billing_recurring_jobs SET status = 'processing', locked_at = now(), locked_by = $1, updated_at = now() WHERE id = $2`,
        [workerId, job.id]
      );
      await subscriptionCyclesMarkProcessing(client, {
        id: job.id,
        subscription_id: job.subscription_id,
        tenant_id: job.tenant_id,
        cycle_key: job.cycle_key,
      });

      const jobCycleCanonical = normalizeBillingCycleKeyYmd(job.cycle_key);
      billingLog('job', 'job_processing_start', {
        workerId,
        jobId: job.id,
        subscriptionId: job.subscription_id,
        tenantId: job.tenant_id,
        cycle_key_raw: job.cycle_key,
        cycle_key_normalized: jobCycleCanonical,
      });

      try {
        const subscription = await getSubscriptionById(job.subscription_id);
        if (!subscription) {
          await cancelBillingRecurringJob(client, job.id, BILLING_RECURRING_JOB_OUTCOME.CANCELLED_SUBSCRIPTION_MISSING);
          result.cancelled++;
          continue;
        }

        const subNextYmd = normalizeBillingCycleKeyYmd(
          normalizeSubscriptionNextBillingYmd(subscription.next_billing_date) ||
            String(subscription.next_billing_date ?? '')
        );
        if (subNextYmd && jobCycleCanonical && subNextYmd !== jobCycleCanonical) {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_JOB_CYCLE_MISMATCH,
            JSON.stringify({
              reason: 'subscription_next_billing_changed_since_enqueue',
              job_cycle_key_raw: job.cycle_key,
              job_cycle_key_normalized: jobCycleCanonical,
              subscription_next_billing_raw: subscription.next_billing_date,
              subscription_next_billing_normalized: subNextYmd,
            }),
            subNextYmd
          );
          result.cancelled++;
          try {
            const desc = await describeRenewalEnqueueWithDb(pool, job.subscription_id);
            if (desc.block_reason) {
              billingLog('worker', 'post_cycle_mismatch_enqueue_blocked', {
                workerId,
                cancelled_job_id: job.id,
                subscription_id: job.subscription_id,
                block_reason: desc.block_reason,
                ...(desc.cycle_key != null ? { cycle_key_canonical: desc.cycle_key } : {}),
                ...(desc.window_diagnostic?.reason != null
                  ? { window_reason: desc.window_diagnostic.reason }
                  : {}),
                ...(desc.predicted_insert != null ? { predicted_insert: desc.predicted_insert } : {}),
                ...(desc.active_blocking_jobs != null && desc.active_blocking_jobs.length > 0
                  ? {
                      active_blocking_job_ids_json: JSON.stringify(desc.active_blocking_jobs.map((j) => j.id)),
                      active_blocking_cycle_keys_raw_json: JSON.stringify(
                        desc.active_blocking_jobs.map((j) => j.cycle_key)
                      ),
                    }
                  : {}),
              });
            } else if (desc.enqueue_row) {
              const ins = await insertOrReactivateRenewalJob(pool, desc.enqueue_row);
              if (ins === 'inserted' || ins === 'reactivated') {
                billingLog('worker', 'post_cycle_mismatch_enqueue_ok', {
                  workerId,
                  cancelled_job_id: job.id,
                  subscription_id: job.subscription_id,
                  mode: ins,
                  ...(desc.cycle_key != null ? { cycle_key: desc.cycle_key } : {}),
                });
              } else {
                billingLog('worker', 'post_cycle_mismatch_enqueue_guard_skip', {
                  workerId,
                  cancelled_job_id: job.id,
                  subscription_id: job.subscription_id,
                  insert_result: ins,
                });
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            billingLog('worker', 'post_cycle_mismatch_enqueue_error', {
              workerId,
              cancelled_job_id: job.id,
              subscription_id: job.subscription_id,
              error: msg,
            });
          }
          continue;
        }

        const tzR = await client.query<{
          timezone: string | null;
          recurring_generate_time_local: string | null;
          invoice_notify_same_as_generation: boolean | null;
          invoice_notify_time_local: string | null;
          recurring_invoice_generate_days_before_due: number | null;
        }>(
          `SELECT timezone::text AS timezone,
                  recurring_generate_time_local::text,
                  invoice_notify_same_as_generation,
                  invoice_notify_time_local::text,
                  recurring_invoice_generate_days_before_due
             FROM tenants WHERE id = $1 LIMIT 1`,
          [job.tenant_id]
        );
        const tcfg = tzR.rows[0] ?? null;
        const cycleDueYmd =
          normalizeBillingCycleKeyYmd(normalizeSubscriptionNextBillingYmd(subscription.next_billing_date)) ||
          normalizeSubscriptionNextBillingYmd(subscription.next_billing_date);
        const diag = buildBillingWindowDiagnostic({
          tenantTimezoneRaw: tcfg?.timezone ?? null,
          recurringGenerateTimeLocalRaw: tcfg?.recurring_generate_time_local ?? null,
          invoiceNotifySameAsGenerationRaw: tcfg?.invoice_notify_same_as_generation ?? null,
          invoiceNotifyTimeLocalRaw: tcfg?.invoice_notify_time_local ?? null,
          nextBillingDate: cycleDueYmd,
          recurringInvoiceGenerateDaysBeforeDue: tcfg?.recurring_invoice_generate_days_before_due ?? 0,
        });
        const twVerbose = isBillingTimeWindowVerbose();
        billingLog('job', 'time_window_worker_check', {
          workerId,
          jobId: job.id,
          tenant_id: job.tenant_id,
          subscription_id: subscription.id,
          next_billing_date: subscription.next_billing_date,
          timezone_effective: diag.timezone_effective,
          timezone_source: diag.timezone_source,
          fallback_applied: diag.fallback_applied,
          would_be_eligible_by_window: diag.would_be_eligible_by_window,
          window_reason: diag.reason,
          phase: 'active_window_phase2',
          time_window_verbose: twVerbose,
          ...(twVerbose
            ? {
                tenant_timezone: diag.tenant_timezone_raw ?? undefined,
                timezone_valid: diag.timezone_valid,
                local_now_ymd: diag.local_now_ymd,
                local_now_hhmm: diag.local_now_hhmm,
                generate_time_local_effective: diag.generate_time_local_effective,
                generate_time_source: diag.generate_time_source,
              }
            : {}),
        });

        if (!diag.would_be_eligible_by_window) {
          const retryAt = buildWindowRequeueAt(new Date());
          await requeueBillingRecurringJobForWindow(client, {
            jobId: job.id,
            retryAt,
          });
          billingLog('job', 'time_window_worker_requeued_outside_window', {
            workerId,
            jobId: job.id,
            tenant_id: job.tenant_id,
            subscription_id: subscription.id,
            next_billing_date: subscription.next_billing_date,
            window_reason: diag.reason,
            timezone_effective: diag.timezone_effective,
            fallback_applied: diag.fallback_applied,
            retry_at: retryAt.toISOString(),
            requeue_minutes: WINDOW_REQUEUE_MINUTES,
            phase: 'active_window_phase2',
            ...(twVerbose
              ? {
                  tenant_timezone: diag.tenant_timezone_raw ?? undefined,
                  local_now_ymd: diag.local_now_ymd,
                  local_now_hhmm: diag.local_now_hhmm,
                }
              : {}),
          });
          result.processed++;
          continue;
        }

        if (subscription.status !== 'active') {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_SUBSCRIPTION_NOT_ACTIVE,
            JSON.stringify({ subscription_status: subscription.status })
          );
          result.cancelled++;
          continue;
        }
        if (subscription.cancel_at_period_end && subscription.current_period_end) {
          if (new Date() > new Date(subscription.current_period_end)) {
            await cancelBillingRecurringJob(
              client,
              job.id,
              BILLING_RECURRING_JOB_OUTCOME.CANCELLED_AFTER_PERIOD_END,
              JSON.stringify({ current_period_end: subscription.current_period_end })
            );
            result.cancelled++;
            continue;
          }
        }

        const periodStartYmd = resolveWorkerJobCycleStartYmd(job, subscription);

        if (subscription.type === 'saas') {
          const existingInvoice = await findInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            periodStartYmd
          );
          if (existingInvoice) {
            await advanceSubscriptionAfterCompletedCycle(client, {
              jobId: job.id,
              subscriptionId: subscription.id,
              tenantId: subscription.tenant_id,
              cycleDateYmd: periodStartYmd,
              source: 'saas_idempotent_invoice',
              resultInvoiceId: existingInvoice.id,
            });
            await completeBillingRecurringJob(client, {
              jobId: job.id,
              resultInvoiceId: existingInvoice.id,
              resultInvoiceType: 'tenant_billing',
              outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_SAAS,
              detail: JSON.stringify({ reused_invoice_id: existingInvoice.id, period_start: periodStartYmd }),
            });
            billingLog('job', 'job_completed_idempotent_saas', {
              jobId: job.id,
              subscriptionId: job.subscription_id,
              result_invoice_id: existingInvoice.id,
            });
            result.processed++;
            continue;
          }
          await processOneRenewalJob(client, job, subscription, periodStartYmd);
        } else if (subscription.type === 'customer') {
          const existingCustomerInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            periodStartYmd
          );
          if (existingCustomerInvoice) {
            await advanceSubscriptionAfterCompletedCycle(client, {
              jobId: job.id,
              subscriptionId: subscription.id,
              tenantId: subscription.tenant_id,
              cycleDateYmd: periodStartYmd,
              source: 'crm_idempotent_invoice',
              resultInvoiceId: existingCustomerInvoice.id,
            });
            await completeBillingRecurringJob(client, {
              jobId: job.id,
              resultInvoiceId: existingCustomerInvoice.id,
              resultInvoiceType: 'customer_invoice',
              outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
              detail: JSON.stringify({ reused_invoice_id: existingCustomerInvoice.id, period_start: periodStartYmd }),
            });
            billingLog('job', 'job_completed_idempotent_customer', {
              jobId: job.id,
              subscriptionId: job.subscription_id,
              result_invoice_id: existingCustomerInvoice.id,
            });
            result.processed++;
            continue;
          }
          await processOneCustomerRenewalJob(client, job, subscription, periodStartYmd);
        } else {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_UNKNOWN_SUBSCRIPTION_TYPE,
            JSON.stringify({ subscription_type: subscription.type })
          );
          result.cancelled++;
          continue;
        }
        result.processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        billingLog('job', 'job_error', {
          jobId: job.id,
          subscriptionId: job.subscription_id,
          tenantId: job.tenant_id,
          cycle_key_raw: job.cycle_key,
          cycle_key_normalized: normalizeBillingCycleKeyYmd(job.cycle_key),
          error: errMsg,
        });
        const attempts = job.attempts + 1;
        const retryAt = new Date();
        if (attempts === 1) retryAt.setHours(retryAt.getHours() + 1);
        else if (attempts === 2) retryAt.setDate(retryAt.getDate() + 1);
        else retryAt.setDate(retryAt.getDate() + 3);
        const status = attempts >= job.max_attempts ? 'failed' : 'pending';
        const hasOc = await billingJobsTableHasOutcomeColumns(client);
        if (hasOc && status === 'failed') {
          await client.query(
            `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4,
              locked_at = NULL, locked_by = NULL,
              completion_outcome = $6, completion_detail = NULL, updated_at = now() WHERE id = $5`,
            [status, attempts, retryAt.toISOString(), errMsg, job.id, BILLING_RECURRING_JOB_OUTCOME.FAILED_MAX_ATTEMPTS]
          );
        } else {
          await client.query(
            `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4,
              locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = $5`,
            [status, attempts, retryAt.toISOString(), errMsg, job.id]
          );
        }
        if (status === 'failed') {
          notifyBillingJobFailed(job.id, job.subscription_id, job.tenant_id, errMsg);
          billingLog('job', 'job_failed_final', { jobId: job.id, subscriptionId: job.subscription_id, attempts });
        } else {
          billingLog('job', 'job_retry_scheduled', { jobId: job.id, subscriptionId: job.subscription_id, attempts, retryAt: retryAt.toISOString() });
        }
        await subscriptionCyclesOnJobFailedAttempt(client, {
          jobId: job.id,
          subscriptionId: job.subscription_id,
          tenantId: job.tenant_id,
          cycleKey: job.cycle_key,
          errorMessage: errMsg,
          finalFailure: status === 'failed',
        });
        result.failed++;
      }
    }

    billingLog('worker', 'batch_done', { workerId, ...result });
    return result;
  });
}

async function processOneRenewalJob(
  client: DbQueryable,
  job: JobRow,
  subscription: SubscriptionRow,
  periodStartYmd: string
): Promise<void> {
  const periodStart = periodStartYmd;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = nextSubscriptionBillingAfterCycle(periodStart, interval);

  const planId = subscription.plan_id;
  if (!planId) {
    throw new Error('Subscription saas sem plan_id');
  }

  const planRow = await pool.query<{
    name: string;
    price_cents: number | null;
    plan_type: string | null;
  }>('SELECT name, price_cents, plan_type FROM plans WHERE id = $1', [planId]);
  const planName = planRow.rows[0]?.name ?? null;
  const planPriceCents = planRow.rows[0]?.price_cents ?? subscription.amount_cents;
  const planType = planRow.rows[0]?.plan_type ?? 'standard';

  const tenantSeats = await pool.query<{ max_users_scheduled_next_cycle: number | null }>(
    `SELECT max_users_scheduled_next_cycle FROM tenants WHERE id = $1`,
    [subscription.tenant_id]
  );
  const scheduledNext = tenantSeats.rows[0]?.max_users_scheduled_next_cycle;
  const isCustom = planType === 'custom';
  let usersForRenewal = subscription.users_count ?? null;
  if (isCustom && scheduledNext != null && scheduledNext >= 1) {
    usersForRenewal = scheduledNext;
  }

  const amountCents = await calculateInvoiceAmount(planId, interval, usersForRenewal);
  const dueDate = periodStart;
  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';

  const invoiceData: CreateInvoiceInput = {
    tenant_id: subscription.tenant_id,
    plan_id: planId,
    billing_interval: interval,
    amount_cents: amountCents,
    due_date: dueDate,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    users_count: usersForRenewal,
    gateway: gatewayKey,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    plan_name_snapshot: planName,
    plan_price_snapshot: planPriceCents ?? amountCents,
  };

  const billing = await createInvoice(invoiceData);

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: subscription.tenant_id });
  if (gateway) {
    try {
      const customerId = await gateway.ensureCustomer?.(subscription.tenant_id);
      if (customerId) {
        const idempotencyKey = `saas_renew_${subscription.id}_${periodStart}`;
        const renewalPm = resolveAutomaticInvoicePaymentMethod(
          subscription.default_payment_method as string | null,
          config
        );
        const chargeResult = await gateway.createCharge({
          customerId,
          amountCents,
          dueDate: periodStart,
          paymentMethod: renewalPm,
          description: billing.invoice_number ?? `Renovação ${periodStart}`,
          idempotencyKey,
          externalReference: subscription.tenant_id,
        });
        await updateInvoiceGatewayData(billing.id, {
          gateway: gatewayKey,
          payment_method: renewalPm,
          gateway_reference_id: chargeResult.paymentId,
          gateway_status: chargeResult.status,
          idempotency_key: idempotencyKey,
        });
      }
    } catch (gatewayErr) {
      console.error('[recurringBillingJobService] gateway createCharge error', { billingId: billing.id, err: gatewayErr });
    }
  }

  schedulePublishPlatformBillingChargeCreated(billing.id);

  await advanceSubscriptionAfterCompletedCycle(client, {
    jobId: job.id,
    subscriptionId: subscription.id,
    tenantId: subscription.tenant_id,
    cycleDateYmd: periodStart,
    source: 'saas_new_invoice',
    resultInvoiceId: billing.id,
  });

  if (isCustom && scheduledNext != null && scheduledNext >= 1) {
    await pool.query(
      `UPDATE tenants
       SET max_users_override = $1,
           max_users_scheduled_next_cycle = NULL,
           updated_at = now()
       WHERE id = $2`,
      [scheduledNext, subscription.tenant_id]
    );
    const sync = await changeSubscriptionPlan(subscription.id, subscription.tenant_id, {
      plan_id: planId,
      users_count: scheduledNext,
      billing_interval: interval,
    });
    if (!sync.ok) {
      console.error('[recurringBillingJobService] falha ao aplicar assentos agendados', sync.error);
    }
  }

  await completeBillingRecurringJob(client, {
    jobId: job.id,
    resultInvoiceId: billing.id,
    resultInvoiceType: 'tenant_billing',
    outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_SAAS,
    detail: JSON.stringify({ tenant_billing_id: billing.id, period_start: periodStart }),
  });
  billingLog('job', 'saas_renewal_invoice_persisted', {
    jobId: job.id,
    subscriptionId: subscription.id,
    tenant_billing_id: billing.id,
  });
}

/**
 * Fase 4: processa um job de renovação para assinatura type=customer (fatura do cliente do CRM).
 * Cria registro em customer_invoices; usa gateway com billingType=crm e ensureCustomerForClient quando disponível.
 */
async function processOneCustomerRenewalJob(
  client: DbQueryable,
  job: JobRow,
  subscription: SubscriptionRow,
  periodStartYmd: string
): Promise<void> {
  const clientId = subscription.customer_id;
  if (!clientId) {
    throw new Error('Subscription customer sem customer_id (client_id)');
  }

  const periodStart = periodStartYmd;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = nextSubscriptionBillingAfterCycle(periodStart, interval);

  const config = await getActiveConfig('crm', subscription.tenant_id);
  const gatewayKey = config?.gateway_key ?? 'asaas';

  // Fase 5 (base estrutural): gerar customer_invoice_items recorrentes por item.
  // Para manter o modelo simples (sem nova tabela de template), usamos a fatura anterior
  // do mesmo subscription_id como fonte dos itens.
  const prevPeriodStart = subscription.current_period_start;
  if (!prevPeriodStart) {
    throw new Error('Subscription current_period_start ausente para recorrência por item');
  }

  const prevInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(subscription.id, prevPeriodStart);
  if (!prevInvoice) {
    throw new Error('Fatura anterior (para copiar itens) não encontrada no subscription');
  }

  const prevItems = await getCustomerInvoiceItems(prevInvoice.id, prevInvoice.tenant_id);

  // D5: só linhas com is_recurring=true entram na próxima fatura de ciclo; demais são “avulsas” neste ciclo.
  const childInvoicesE2Enabled = isChildItemInvoicesEnabled();
  const includedItems: Array<CustomerInvoiceItemRow & { next_due_date: string }> = [];
  for (const it of prevItems) {
    if (!it.is_recurring) continue;

    const { excludedForE2ChildPath, itemDue } = resolveMainRenewalItemDue({
      childInvoicesE2Enabled,
      scheduledDueDate: it.scheduled_due_date,
      periodStart,
      prevInvoiceDueDate: prevInvoice.due_date,
    });
    if (excludedForE2ChildPath) continue;

    const itemInterval = (it.recurring_interval ?? 'monthly') as CustomerItemRecurringInterval;

    // Só inclui itens que já chegaram (ou passaram) no due deste ciclo.
    if (itemDue > periodStart) continue;

    // Avança o próximo agendamento do item até ficar estritamente depois do período atual.
    let nextDue = calculateNextItemDueDate(itemDue, itemInterval);
    while (nextDue <= periodStart) {
      nextDue = calculateNextItemDueDate(nextDue, itemInterval);
    }

    includedItems.push({ ...it, next_due_date: nextDue });
  }

  if (includedItems.length === 0) {
    // Não cria fatura vazia; apenas avança o ciclo.
    const recurringLines = prevItems.filter((i) => i.is_recurring).length;
    const skippedChildSchedule = prevItems.filter((i) => {
      if (!i.is_recurring) return false;
      return resolveMainRenewalItemDue({
        childInvoicesE2Enabled,
        scheduledDueDate: i.scheduled_due_date,
        periodStart,
        prevInvoiceDueDate: prevInvoice.due_date,
      }).excludedForE2ChildPath;
    }).length;
    const skippedFutureItemDue = prevItems.filter((i) => {
      if (!i.is_recurring) return false;
      const r = resolveMainRenewalItemDue({
        childInvoicesE2Enabled,
        scheduledDueDate: i.scheduled_due_date,
        periodStart,
        prevInvoiceDueDate: prevInvoice.due_date,
      });
      if (r.excludedForE2ChildPath) return false;
      return r.itemDue > periodStart;
    }).length;
    const detail = JSON.stringify({
      reason: 'no_eligible_recurring_items_for_cycle',
      prev_invoice_id: prevInvoice.id,
      period_start: periodStart,
      prev_item_count: prevItems.length,
      recurring_line_count: recurringLines,
      skipped_child_schedule_count: skippedChildSchedule,
      skipped_item_due_after_period_start: skippedFutureItemDue,
      child_invoices_e2_enabled: childInvoicesE2Enabled,
      operational_note:
        'Não é sucesso financeiro: ciclo avançou sem nova customer_invoice. Ver itens recorrentes / E2 / gateway.',
    });
    await advanceSubscriptionAfterCompletedCycle(client, {
      jobId: job.id,
      subscriptionId: subscription.id,
      tenantId: subscription.tenant_id,
      cycleDateYmd: periodStart,
      source: 'crm_no_eligible_items',
      resultInvoiceId: null,
    });
    await completeBillingRecurringJob(client, {
      jobId: job.id,
      resultInvoiceId: null,
      resultInvoiceType: null,
      outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS,
      detail,
    });
    billingLog('job', 'customer_renewal_completed_without_invoice', {
      jobId: job.id,
      subscriptionId: subscription.id,
      tenantId: subscription.tenant_id,
      outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS,
      has_result_invoice: false,
      period_start: periodStart,
      prev_invoice_id: prevInvoice.id,
      prev_item_count: prevItems.length,
      recurring_line_count: recurringLines,
      financial_success: false,
    });
    if (shouldAlertNoInvoiceCycle()) {
      billingLog('job', 'operational_alert_completed_without_invoice', {
        notify: true,
        jobId: job.id,
        subscriptionId: subscription.id,
        tenantId: subscription.tenant_id,
        outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS,
      });
    }
    return;
  }

  const amountCents = includedItems.reduce((sum, it) => sum + Math.max(0, it.total_cents), 0);

  const inv = await createCustomerInvoice({
    tenant_id: subscription.tenant_id,
    client_id: clientId,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    amount_cents: amountCents,
    due_date: periodStart,
    gateway: gatewayKey,
  });

  // Insere itens no novo invoice com o próximo scheduled_due_date (migração 80).
  const itemSchema = await getCustomerInvoiceSchema();
  for (const it of includedItems) {
    if (itemSchema.hasInvoiceItemAdvancedColumns) {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
        is_recurring, recurring_interval, scheduled_due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          inv.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sort_order,
          it.is_recurring,
          it.recurring_interval ?? null,
          it.next_due_date,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          inv.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sort_order,
        ]
      );
    }
  }

  const gateway = await getActiveGateway({ billingType: 'crm', tenantId: subscription.tenant_id });
  if (gateway) {
    try {
      let customerId = (await getPaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId))?.gateway_customer_id ?? null;
      let clientRow = await pool.query<{
        name: string;
        email: string | null;
        phone: string | null;
        company: string | null;
        cpf_cnpj: string | null;
      }>('SELECT name, email, phone, company, cpf_cnpj FROM clients WHERE id = $1', [clientId]);
      let c = clientRow.rows[0];
      if (!customerId && gateway.ensureCustomerForClient && c) {
        customerId = await gateway.ensureCustomerForClient(subscription.tenant_id, clientId, {
          name: c.name,
          email: c.email ?? '',
          phone: c.phone ?? undefined,
          cpfCnpj: c.cpf_cnpj?.trim() || undefined,
        });
        await createPaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId, customerId, clientId);
      }
      if (customerId) {
        let idempotencyKey = `customer_renew_${subscription.id}_${periodStart}`;
        const renewalPm = resolveAutomaticInvoicePaymentMethod(
          subscription.default_payment_method as string | null,
          config
        );
        const runCharge = () =>
          gateway.createCharge({
            customerId: customerId!,
            amountCents,
            dueDate: periodStart,
            paymentMethod: renewalPm,
            description: inv.invoice_number ?? `Cobrança ${periodStart}`,
            idempotencyKey,
            externalReference: clientId,
          });
        let chargeResult;
        try {
          chargeResult = await runCharge();
        } catch (renewErr) {
          if (
            !isAsaasInvalidCustomerError(renewErr) ||
            !gateway.ensureCustomerForClient ||
            !c
          ) {
            throw renewErr;
          }
          await deletePaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId);
          customerId = await gateway.ensureCustomerForClient(subscription.tenant_id, clientId, {
            name: c.name,
            email: c.email ?? '',
            phone: c.phone ?? undefined,
            cpfCnpj: c.cpf_cnpj?.trim() || undefined,
          });
          await createPaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId, customerId, clientId);
          idempotencyKey = `customer_renew_${subscription.id}_${periodStart}_r_${crypto.randomUUID().slice(0, 8)}`;
          chargeResult = await runCharge();
        }
        await updateCustomerInvoiceGatewayData(inv.id, {
          gateway: gatewayKey,
          payment_method: renewalPm,
          gateway_reference_id: chargeResult.paymentId,
          gateway_status: chargeResult.status,
          idempotency_key: idempotencyKey,
        });
      }
    } catch (gatewayErr) {
      console.error('[recurringBillingJobService] gateway createCharge (customer) error', { invoiceId: inv.id, err: gatewayErr });
    }
  }

  await advanceSubscriptionAfterCompletedCycle(client, {
    jobId: job.id,
    subscriptionId: subscription.id,
    tenantId: subscription.tenant_id,
    cycleDateYmd: periodStart,
    source: 'crm_new_invoice',
    resultInvoiceId: inv.id,
  });

  await completeBillingRecurringJob(client, {
    jobId: job.id,
    resultInvoiceId: inv.id,
    resultInvoiceType: 'customer_invoice',
    outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
    detail: JSON.stringify({
      payment_token_present: Boolean(inv.payment_token),
      invoice_number: inv.invoice_number ?? null,
      period_start: periodStart,
    }),
  });
  billingLog('job', 'customer_renewal_invoice_persisted', {
    jobId: job.id,
    subscriptionId: subscription.id,
    invoiceId: inv.id,
    payment_token_present: Boolean(inv.payment_token),
    origin: inv.origin,
    invoice_type: inv.invoice_type,
  });
}


export interface ProcessChildInvoicesResult {
  created: number;
  skipped: number;
  errors: number;
}

/**
 * E2: processa itens recorrentes com scheduled_due_date fora do period_start da fatura pai
 * (cobrança em outra data). Cria fatura filha + cobrança no gateway e avança scheduled_due_date no item pai.
 */
export async function processChildItemDueInvoices(): Promise<ProcessChildInvoicesResult> {
  return withBillingWorkerRlsBypass(async () => {
    const result: ProcessChildInvoicesResult = { created: 0, skipped: 0, errors: 0 };

    if (!isChildItemInvoicesEnabled()) {
      billingLog('worker', 'child_invoices_feature_off', {
        hint: 'Set BILLING_CHILD_ITEM_INVOICES_ENABLED=true to enable E2 child invoices',
      });
      return result;
    }

    const batchLimit = getChildBillingBatchLimit();

  type Row = {
    item_id: string;
    parent_invoice_id: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit_price_cents: number;
    discount_cents: number;
    total_cents: number;
    sort_order: number;
    is_recurring: boolean;
    recurring_interval: string | null;
    scheduled_due_date: string;
    tenant_id: string;
    client_id: string;
    subscription_id: string;
    inv_period_start: string | null;
    inv_due_date: string;
  };

  const q = await pool.query<Row>(
    `SELECT
       cii.id AS item_id,
       cii.invoice_id AS parent_invoice_id,
       cii.product_id,
       cii.description,
       cii.quantity,
       cii.unit_price_cents,
       cii.discount_cents,
       cii.total_cents,
       cii.sort_order,
       cii.is_recurring,
       cii.recurring_interval,
       cii.scheduled_due_date,
       ci.tenant_id,
       ci.client_id,
       ci.subscription_id,
       ci.period_start AS inv_period_start,
       ci.due_date AS inv_due_date
     FROM customer_invoice_items cii
     INNER JOIN customer_invoices ci ON ci.id = cii.invoice_id
     WHERE cii.is_recurring = true
       AND cii.scheduled_due_date IS NOT NULL
       AND cii.scheduled_due_date <= CURRENT_DATE
       AND ci.subscription_id IS NOT NULL
       AND ci.client_id IS NOT NULL
       AND COALESCE(ci.invoice_type, '') <> 'child'
       AND (
         (ci.period_start IS NOT NULL AND cii.scheduled_due_date <> ci.period_start)
         OR (ci.period_start IS NULL AND cii.scheduled_due_date <> ci.due_date)
       )
       AND NOT EXISTS (
         SELECT 1 FROM customer_invoices ch
         WHERE ch.parent_invoice_item_id = cii.id
           AND ch.due_date = cii.scheduled_due_date
       )
     ORDER BY cii.scheduled_due_date ASC
     LIMIT $1`,
    [batchLimit]
  );

  const childItemSchema = await getCustomerInvoiceSchema();

  for (const row of q.rows) {
    const subscription = await getSubscriptionById(row.subscription_id);
    if (!subscription || subscription.type !== 'customer' || !subscription.customer_id) {
      result.skipped++;
      continue;
    }
    if (subscription.customer_id !== row.client_id) {
      result.skipped++;
      continue;
    }

    const itemInterval = (row.recurring_interval ?? 'monthly') as CustomerItemRecurringInterval;
    const due = row.scheduled_due_date;
    const nextDue = calculateNextItemDueDate(due, itemInterval);
    const config = await getActiveConfig('crm', row.tenant_id);
    const gatewayKey = config?.gateway_key ?? 'asaas';

    let childInv;
    try {
      childInv = await createChildCustomerInvoice({
        tenant_id: row.tenant_id,
        client_id: row.client_id,
        subscription_id: row.subscription_id,
        parent_invoice_id: row.parent_invoice_id,
        parent_invoice_item_id: row.item_id,
        amount_cents: Math.max(0, row.total_cents),
        due_date: due,
        gateway: gatewayKey,
      });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === '23505') {
        result.skipped++;
        continue;
      }
      billingLog('worker', 'child_invoice_insert_error', { itemId: row.item_id, error: String(err) });
      result.errors++;
      continue;
    }

    try {
      if (childItemSchema.hasInvoiceItemAdvancedColumns) {
        await pool.query(
          `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
          is_recurring, recurring_interval, scheduled_due_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            childInv.id,
            row.product_id,
            row.description,
            row.quantity,
            row.unit_price_cents,
            row.discount_cents,
            row.total_cents,
            row.sort_order,
            row.is_recurring,
            row.recurring_interval,
            nextDue,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            childInv.id,
            row.product_id,
            row.description,
            row.quantity,
            row.unit_price_cents,
            row.discount_cents,
            row.total_cents,
            row.sort_order,
          ]
        );
      }
    } catch (err) {
      billingLog('worker', 'child_item_insert_error', { invoiceId: childInv.id, error: String(err) });
      result.errors++;
      continue;
    }

    const clientId = row.client_id;
    const gateway = await getActiveGateway({ billingType: 'crm', tenantId: row.tenant_id });
    if (gateway) {
      try {
        let customerId =
          (await getPaymentCustomerForClient(row.tenant_id, gatewayKey, clientId))?.gateway_customer_id ?? null;
        const childClientRow = await pool.query<{
          name: string;
          email: string | null;
          phone: string | null;
          cpf_cnpj: string | null;
        }>('SELECT name, email, phone, cpf_cnpj FROM clients WHERE id = $1', [clientId]);
        const childClient = childClientRow.rows[0];
        if (!customerId && gateway.ensureCustomerForClient && childClient) {
          customerId = await gateway.ensureCustomerForClient(row.tenant_id, clientId, {
            name: childClient.name,
            email: childClient.email ?? '',
            phone: childClient.phone ?? undefined,
            cpfCnpj: childClient.cpf_cnpj?.trim() || undefined,
          });
          await createPaymentCustomerForClient(row.tenant_id, gatewayKey, clientId, customerId, clientId);
        }
        if (customerId) {
          let idempotencyKey = `customer_child_${row.item_id}_${due}`;
          const childPm = resolveAutomaticInvoicePaymentMethod(
            subscription.default_payment_method as string | null,
            config
          );
          const runChildCharge = () =>
            gateway.createCharge({
              customerId: customerId!,
              amountCents: Math.max(0, row.total_cents),
              dueDate: due,
              paymentMethod: childPm,
              description: childInv.invoice_number ?? `Cobrança item ${due}`,
              idempotencyKey,
              externalReference: clientId,
            });
          let chargeResult;
          try {
            chargeResult = await runChildCharge();
          } catch (childErr) {
            if (
              !isAsaasInvalidCustomerError(childErr) ||
              !gateway.ensureCustomerForClient ||
              !childClient
            ) {
              throw childErr;
            }
            await deletePaymentCustomerForClient(row.tenant_id, gatewayKey, clientId);
            customerId = await gateway.ensureCustomerForClient(row.tenant_id, clientId, {
              name: childClient.name,
              email: childClient.email ?? '',
              phone: childClient.phone ?? undefined,
              cpfCnpj: childClient.cpf_cnpj?.trim() || undefined,
            });
            await createPaymentCustomerForClient(row.tenant_id, gatewayKey, clientId, customerId, clientId);
            idempotencyKey = `customer_child_${row.item_id}_${due}_r_${crypto.randomUUID().slice(0, 8)}`;
            chargeResult = await runChildCharge();
          }
          await updateCustomerInvoiceGatewayData(childInv.id, {
            gateway: gatewayKey,
            payment_method: childPm,
            gateway_reference_id: chargeResult.paymentId,
            gateway_status: chargeResult.status,
            idempotency_key: idempotencyKey,
          });
        }
      } catch (gatewayErr) {
        console.error('[recurringBillingJobService] gateway createCharge (child) error', {
          invoiceId: childInv.id,
          err: gatewayErr,
        });
      }
    }

    await pool.query(
      `UPDATE customer_invoice_items SET scheduled_due_date = $1 WHERE id = $2`,
      [nextDue, row.item_id]
    );

    billingLog('worker', 'child_invoice_done', { invoiceId: childInv.id, parentItemId: row.item_id, due });
    result.created++;
  }

    billingLog('worker', 'child_batch_summary', {
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      candidates: q.rows.length,
      batchLimit,
    });

    return result;
  });
}
