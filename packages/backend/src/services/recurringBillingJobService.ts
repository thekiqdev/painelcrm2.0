/**
 * Billing Engine: scheduler (enfileirar jobs) e worker (processar jobs).
 * Scheduler: SELECT subscriptions WHERE status='active' AND next_billing_date <= CURRENT_DATE LIMIT 500.
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
import {
  getChildBillingBatchLimit,
  isBillingSchedulerVerbose,
  isBillingTimeWindowVerbose,
  isChildItemInvoicesEnabled,
  shouldAlertNoInvoiceCycle,
} from '../config/billingEnv.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';
import { resolveMainRenewalItemDue } from './recurringCustomerRenewalItemDueAnchor.js';
import { buildBillingWindowDiagnostic } from './billingTimeWindowObservability.js';

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

/**
 * Alinha o worker ao scheduler: mesma noção de "hoje" da sessão PostgreSQL (`CURRENT_DATE`).
 * Evita comparar `next_billing_date` (DATE) com string UTC (`toISOString`) em bordas de fuso.
 */
async function getBillingWorkerDateInDatabase(db: DbQueryable): Promise<string> {
  const r = await db.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
  const d = r.rows[0]?.d?.trim();
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date().toISOString().slice(0, 10);
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
}

async function cancelBillingRecurringJob(
  db: DbQueryable,
  jobId: string,
  outcome: string,
  detail?: string | null
): Promise<void> {
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
};

export function normalizeSubscriptionNextBillingYmd(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

type InsertOrReactivateRenewalJobResult =
  | 'inserted'
  | 'reactivated'
  | 'skipped_active_exists'
  | 'skipped_completed_cycle';

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
  const cycleKey = row.next_billing_date;

  const activeR = await db.query<{ id: string }>(
    `SELECT id FROM billing_recurring_jobs
     WHERE subscription_id = $1 AND cycle_key = $2 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [subscriptionId, cycleKey]
  );
  if (activeR.rows.length > 0) {
    return 'skipped_active_exists';
  }

  const existingR = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM billing_recurring_jobs
     WHERE subscription_id = $1 AND cycle_key = $2
     LIMIT 1`,
    [subscriptionId, cycleKey]
  );
  const ex = existingR.rows[0];
  const has = await billingJobsTableHasOutcomeColumns(db);

  if (ex) {
    if (ex.status === 'cancelled' || ex.status === 'failed') {
      if (has) {
        await db.query(
          `UPDATE billing_recurring_jobs SET
            status = 'pending',
            scheduled_at = ($1::date)::timestamptz,
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
           WHERE id = $2`,
          [cycleKey, ex.id]
        );
      } else {
        await db.query(
          `UPDATE billing_recurring_jobs SET
            status = 'pending',
            scheduled_at = ($1::date)::timestamptz,
            retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            error_message = NULL,
            result_invoice_id = NULL,
            result_invoice_type = NULL,
            attempts = 0,
            updated_at = now()
           WHERE id = $2`,
          [cycleKey, ex.id]
        );
      }
      billingLog('scheduler', 'enqueue_job_reactivated_stale_cycle', {
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        cycle_key: cycleKey,
        prior_status: ex.status,
      });
      return 'reactivated';
    }
    if (ex.status === 'completed') {
      if (isBillingSchedulerVerbose()) {
        billingLog('scheduler', 'enqueue_skipped_completed_cycle_exists', {
          subscription_id: subscriptionId,
          tenant_id: tenantId,
          cycle_key: cycleKey,
        });
      }
      return 'skipped_completed_cycle';
    }
    return 'skipped_active_exists';
  }

  try {
    await db.query(
      `INSERT INTO billing_recurring_jobs (subscription_id, tenant_id, job_type, cycle_key, scheduled_at, status)
       VALUES ($1, $2, 'renewal', $3, ($4::date)::timestamptz, 'pending')`,
      [subscriptionId, tenantId, cycleKey, row.next_billing_date]
    );
    return 'inserted';
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code !== '23505') throw e;
    const afterR = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM billing_recurring_jobs
       WHERE subscription_id = $1 AND cycle_key = $2
       LIMIT 1`,
      [subscriptionId, cycleKey]
    );
    const rowAfter = afterR.rows[0];
    if (rowAfter?.status === 'pending' || rowAfter?.status === 'processing') {
      return 'skipped_active_exists';
    }
    if (rowAfter?.status === 'completed') {
      return 'skipped_completed_cycle';
    }
    return 'skipped_active_exists';
  }
}

export type TryEnqueueRenewalReason =
  | 'subscription_not_found'
  | 'subscription_not_active'
  | 'subscription_type_unsupported'
  | 'next_billing_after_db_today'
  | 'outside_local_window'
  | 'active_job_exists'
  | 'completed_cycle_guard';

export type TryEnqueueRenewalJobForSubscriptionResult =
  | { ok: true; mode: 'inserted' | 'reactivated' }
  | { ok: false; reason: TryEnqueueRenewalReason };

/**
 * Tenta enfileirar um job de renovação para uma assinatura já elegível (mesma lógica do scheduler: CURRENT_DATE + janela local).
 * Usado após PATCH de `next_billing_date` para não depender apenas do próximo tick do cron.
 */
export async function tryEnqueueRenewalJobForSubscriptionId(
  subscriptionId: string
): Promise<TryEnqueueRenewalJobForSubscriptionResult> {
  return withBillingWorkerRlsBypass(async () => {
    const r = await pool.query<
      RenewalEnqueueTenantJoinRow & {
        status: string;
        type: string;
      }
    >(
      `SELECT s.id, s.tenant_id, s.next_billing_date::text, s.status, s.type,
              t.timezone::text AS tenant_timezone,
              t.recurring_generate_time_local::text,
              t.invoice_notify_same_as_generation,
              t.invoice_notify_time_local::text
       FROM subscriptions s
       LEFT JOIN tenants t ON t.id = s.tenant_id
       WHERE s.id = $1
       LIMIT 1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    if (!row) return { ok: false, reason: 'subscription_not_found' };
    if (row.status !== 'active') return { ok: false, reason: 'subscription_not_active' };
    if (row.type !== 'customer' && row.type !== 'saas') {
      return { ok: false, reason: 'subscription_type_unsupported' };
    }

    const eligibleR = await pool.query<{ ok: boolean }>(
      `SELECT (s.next_billing_date <= CURRENT_DATE) AS ok
       FROM subscriptions s WHERE s.id = $1`,
      [subscriptionId]
    );
    if (!eligibleR.rows[0]?.ok) {
      return { ok: false, reason: 'next_billing_after_db_today' };
    }

    const diag = buildBillingWindowDiagnostic({
      tenantTimezoneRaw: row.tenant_timezone ?? null,
      recurringGenerateTimeLocalRaw: row.recurring_generate_time_local ?? null,
      invoiceNotifySameAsGenerationRaw: row.invoice_notify_same_as_generation ?? null,
      invoiceNotifyTimeLocalRaw: row.invoice_notify_time_local ?? null,
      nextBillingDate: row.next_billing_date,
    });
    if (!diag.would_be_eligible_by_window) {
      return { ok: false, reason: 'outside_local_window' };
    }

    const joinRow: RenewalEnqueueTenantJoinRow = {
      id: row.id,
      tenant_id: row.tenant_id,
      next_billing_date: row.next_billing_date,
      tenant_timezone: row.tenant_timezone,
      recurring_generate_time_local: row.recurring_generate_time_local,
      invoice_notify_same_as_generation: row.invoice_notify_same_as_generation,
      invoice_notify_time_local: row.invoice_notify_time_local,
    };

    const outcome = await insertOrReactivateRenewalJob(pool, joinRow);
    if (outcome === 'inserted' || outcome === 'reactivated') {
      billingLog('scheduler', 'enqueue_after_next_billing_manual_patch', {
        subscription_id: subscriptionId,
        tenant_id: row.tenant_id,
        mode: outcome,
      });
      return { ok: true, mode: outcome };
    }
    if (outcome === 'skipped_active_exists') return { ok: false, reason: 'active_job_exists' };
    return { ok: false, reason: 'completed_cycle_guard' };
  });
}

/**
 * Scheduler: busca assinaturas com next_billing_date <= CURRENT_DATE e enfileira um job por ciclo (cycle_key).
 * Usar CURRENT_DATE para evitar drift de timezone/hora. LIMIT 500 por execução.
 * Também expira assinaturas com cancel_at_period_end e current_period_end < hoje.
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
    }>(
      `SELECT s.id, s.tenant_id, s.next_billing_date, t.timezone::text AS tenant_timezone,
              t.recurring_generate_time_local::text,
              t.invoice_notify_same_as_generation,
              t.invoice_notify_time_local::text
       FROM subscriptions s
       LEFT JOIN tenants t ON t.id = s.tenant_id
       WHERE s.status = 'active' AND s.next_billing_date <= CURRENT_DATE
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
      const cycleKey = row.next_billing_date; // YYYY-MM-DD
      const diag = buildBillingWindowDiagnostic({
        tenantTimezoneRaw: row.tenant_timezone ?? null,
        recurringGenerateTimeLocalRaw: row.recurring_generate_time_local ?? null,
        invoiceNotifySameAsGenerationRaw: row.invoice_notify_same_as_generation ?? null,
        invoiceNotifyTimeLocalRaw: row.invoice_notify_time_local ?? null,
        nextBillingDate: row.next_billing_date,
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
        next_billing_date: row.next_billing_date,
        tenant_timezone: row.tenant_timezone,
        recurring_generate_time_local: row.recurring_generate_time_local,
        invoice_notify_same_as_generation: row.invoice_notify_same_as_generation,
        invoice_notify_time_local: row.invoice_notify_time_local,
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
 * Worker: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Valida subscription (active, next_billing_date <= CURRENT_DATE, cancel_at_period_end); cria fatura; chama gateway; atualiza subscription (last_job_at, next_billing_date, etc.) e job.
 */
export async function processNextBatch(workerId: string): Promise<{ processed: number; failed: number; cancelled: number }> {
  return withBillingWorkerRlsBypass(async () => {
    const client = dbRequestStorage.getStore()?.client;
    if (!client) {
      throw new Error('billing worker RLS context missing');
    }
    const result = { processed: 0, failed: 0, cancelled: 0 };

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
    billingLog('worker', 'batch_start', { workerId, batchSize: jobs.length });

    for (const job of jobs) {
      await client.query(
        `UPDATE billing_recurring_jobs SET status = 'processing', locked_at = now(), locked_by = $1, updated_at = now() WHERE id = $2`,
        [workerId, job.id]
      );

      billingLog('job', 'job_processing_start', {
        workerId,
        jobId: job.id,
        subscriptionId: job.subscription_id,
        tenantId: job.tenant_id,
        cycleKey: job.cycle_key,
      });

      try {
        const subscription = await getSubscriptionById(job.subscription_id);
        if (!subscription) {
          await cancelBillingRecurringJob(client, job.id, BILLING_RECURRING_JOB_OUTCOME.CANCELLED_SUBSCRIPTION_MISSING);
          result.cancelled++;
          continue;
        }

        const subNextYmd = normalizeSubscriptionNextBillingYmd(subscription.next_billing_date);
        if (subNextYmd && job.cycle_key && subNextYmd !== job.cycle_key) {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_JOB_CYCLE_MISMATCH,
            JSON.stringify({
              reason: 'subscription_next_billing_changed_since_enqueue',
              job_cycle_key: job.cycle_key,
              subscription_next_billing_date: subNextYmd,
            })
          );
          result.cancelled++;
          continue;
        }

        const tzR = await client.query<{
          timezone: string | null;
          recurring_generate_time_local: string | null;
          invoice_notify_same_as_generation: boolean | null;
          invoice_notify_time_local: string | null;
        }>(
          `SELECT timezone::text AS timezone,
                  recurring_generate_time_local::text,
                  invoice_notify_same_as_generation,
                  invoice_notify_time_local::text
             FROM tenants WHERE id = $1 LIMIT 1`,
          [job.tenant_id]
        );
        const tcfg = tzR.rows[0] ?? null;
        const diag = buildBillingWindowDiagnostic({
          tenantTimezoneRaw: tcfg?.timezone ?? null,
          recurringGenerateTimeLocalRaw: tcfg?.recurring_generate_time_local ?? null,
          invoiceNotifySameAsGenerationRaw: tcfg?.invoice_notify_same_as_generation ?? null,
          invoiceNotifyTimeLocalRaw: tcfg?.invoice_notify_time_local ?? null,
          nextBillingDate: subscription.next_billing_date,
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

        const dbToday = await getBillingWorkerDateInDatabase(client);
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
        if (subscription.next_billing_date > dbToday) {
          await cancelBillingRecurringJob(
            client,
            job.id,
            BILLING_RECURRING_JOB_OUTCOME.CANCELLED_NEXT_BILLING_AFTER_DB_TODAY,
            JSON.stringify({ next_billing_date: subscription.next_billing_date, db_today: dbToday })
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

        if (subscription.type === 'saas') {
          const existingInvoice = await findInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            subscription.next_billing_date
          );
          if (existingInvoice) {
            const periodStart = subscription.next_billing_date;
            const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
            const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);
            await updateSubscriptionAfterRenewal(subscription.id, {
              next_billing_date: periodEnd,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              billing_cycle_count: subscription.billing_cycle_count + 1,
            });
            await completeBillingRecurringJob(client, {
              jobId: job.id,
              resultInvoiceId: existingInvoice.id,
              resultInvoiceType: 'tenant_billing',
              outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_SAAS,
              detail: JSON.stringify({ reused_invoice_id: existingInvoice.id, period_start: periodStart }),
            });
            billingLog('job', 'job_completed_idempotent_saas', {
              jobId: job.id,
              subscriptionId: job.subscription_id,
              result_invoice_id: existingInvoice.id,
            });
            result.processed++;
            continue;
          }
          await processOneRenewalJob(job, subscription);
        } else if (subscription.type === 'customer') {
          const existingCustomerInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            subscription.next_billing_date
          );
          if (existingCustomerInvoice) {
            const periodStart = subscription.next_billing_date;
            const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
            const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);
            await updateSubscriptionAfterRenewal(subscription.id, {
              next_billing_date: periodEnd,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              billing_cycle_count: subscription.billing_cycle_count + 1,
            });
            await completeBillingRecurringJob(client, {
              jobId: job.id,
              resultInvoiceId: existingCustomerInvoice.id,
              resultInvoiceType: 'customer_invoice',
              outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
              detail: JSON.stringify({ reused_invoice_id: existingCustomerInvoice.id, period_start: periodStart }),
            });
            billingLog('job', 'job_completed_idempotent_customer', {
              jobId: job.id,
              subscriptionId: job.subscription_id,
              result_invoice_id: existingCustomerInvoice.id,
            });
            result.processed++;
            continue;
          }
          await processOneCustomerRenewalJob(job, subscription);
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
          cycleKey: job.cycle_key,
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
              completion_outcome = $6, completion_detail = NULL, updated_at = now() WHERE id = $5`,
            [status, attempts, retryAt.toISOString(), errMsg, job.id, BILLING_RECURRING_JOB_OUTCOME.FAILED_MAX_ATTEMPTS]
          );
        } else {
          await client.query(
            `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4, updated_at = now() WHERE id = $5`,
            [status, attempts, retryAt.toISOString(), errMsg, job.id]
          );
        }
        if (status === 'failed') {
          notifyBillingJobFailed(job.id, job.subscription_id, job.tenant_id, errMsg);
          billingLog('job', 'job_failed_final', { jobId: job.id, subscriptionId: job.subscription_id, attempts });
        } else {
          billingLog('job', 'job_retry_scheduled', { jobId: job.id, subscriptionId: job.subscription_id, attempts, retryAt: retryAt.toISOString() });
        }
        result.failed++;
      }
    }

    billingLog('worker', 'batch_done', { workerId, ...result });
    return result;
  });
}

async function processOneRenewalJob(job: JobRow, subscription: SubscriptionRow): Promise<void> {
  const periodStart = subscription.next_billing_date;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);

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

  await updateSubscriptionAfterRenewal(subscription.id, {
    next_billing_date: periodEnd,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    billing_cycle_count: subscription.billing_cycle_count + 1,
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

  await completeBillingRecurringJob(pool, {
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
async function processOneCustomerRenewalJob(job: JobRow, subscription: SubscriptionRow): Promise<void> {
  const clientId = subscription.customer_id;
  if (!clientId) {
    throw new Error('Subscription customer sem customer_id (client_id)');
  }

  const periodStart = subscription.next_billing_date;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);

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
    await updateSubscriptionAfterRenewal(subscription.id, {
      next_billing_date: periodEnd,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      billing_cycle_count: subscription.billing_cycle_count + 1,
    });
    await completeBillingRecurringJob(pool, {
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

  await updateSubscriptionAfterRenewal(subscription.id, {
    next_billing_date: periodEnd,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    billing_cycle_count: subscription.billing_cycle_count + 1,
  });

  await completeBillingRecurringJob(pool, {
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
