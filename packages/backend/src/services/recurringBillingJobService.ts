/**
 * Billing Engine: scheduler (enfileirar jobs) e worker (processar jobs).
 * Scheduler: assinaturas ativas em que (next_billing_date − dias de antecipação do tenant) ≤ CURRENT_DATE,
 * depois janela horária local (Fase 2). cycle_key = vencimento do ciclo; due_date da fatura = mesmo dia.
 * Worker: SELECT jobs FOR UPDATE SKIP LOCKED LIMIT 100; validar subscription; criar fatura; gateway; atualizar subscription e job.
 */
import crypto from 'node:crypto';
import { pool, dbRequestStorage, withBillingWorkerRlsBypass } from '../utils/db.js';

import { billingLog, notifyBillingJobFailed, subscriptionBillingLog } from './billingLogger.js';
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
import { publishPlatformBillingChargeCreated } from './platformNotifications/platformBusinessNotifications.js';
import { ensureBillingChargeNotificationExists } from './platformNotifications/platformBillingChargeNotification.js';
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
import { calculateSaasRenewalInvoiceAmount, type BillingInterval } from './billingService.js';
import { trySettleZeroAmountBillingIfEligible } from '../commercial/zeroAmountSettlementService.js';
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
  effectiveRecurringGenerateDaysBeforeDue,
  isGenerateDaysBeforeCappedForInterval,
} from '../utils/billingIntervalGenerationCap.js';
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
import { logRenewalAttemptTrace } from './renewalAttemptTrace.js';
import { validateRenewalContext } from './renewalValidationPipeline.js';
import {
  classifyRenewalError,
  isPermanentRenewalError,
  RenewalHardeningError,
  shouldRetryRenewalError,
} from './renewalErrorClassification.js';
import { probeSubscriptionCustomerId, resolveAndPersistSubscriptionCustomerId } from './renewalCustomerResolution.js';
import {
  MANUAL_JOB_PREPARE_STATUSES_SQL,
  emitRenewalPipelineError,
  emitRenewalPipelineStage,
  emitRenewalPipelineStageEnd,
  type RenewalPipelineContextInput,
} from './renewalPipelineTrace.js';
import { safeParseYmd, safeNowIso, safeToISOString } from '../utils/billingSafeDate.js';
import { buildRenewalHistoryRecord, recordRenewalHistory } from './renewalHistoryRecorder.js';
import { classifyBillingRenewalError, logBillingRenewalError } from './billingRenewalError.js';
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
import {
  materializePlannedCycles,
  planSchedulerEligibleCycle,
} from './subscriptionCyclePlanner.js';
import { emitBillingWorkerBatchDiagnostic } from './billingWorkerBatchDiagnostic.js';
import { BillingRenewalEngine } from './billingRenewalEngine/index.js';
import { executeWorkerCrmRenewal } from './workerCrmRenewalPipeline/index.js';
import {
  patchBillingJobTraceContext,
  traceBillingJobMutation,
  traceBillingJobPhase,
  traceBillingJobSelect,
  traceEngineNotReached,
} from './billingJobLifecycleTrace.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  advanceSubscriptionAfterCompletedCycle,
  billingJobsTableHasOutcomeColumns,
  cancelBillingRecurringJob,
  completeBillingRecurringJob,
  computeFinalNextBillingForCompletedCycle,
} from './billingRecurringJobPersistence.js';
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
  YMD_STRICT,
} from '../utils/billingCycleKey.js';

export {
  BILLING_RECURRING_JOB_OUTCOME,
  computeFinalNextBillingForCompletedCycle,
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
};

const SCHEDULER_LIMIT = 500;
const WORKER_BATCH_SIZE = 100;

type DbQueryable = { query: (typeof pool)['query'] };
const WINDOW_REQUEUE_MINUTES = 15;

async function requeueBillingRecurringJobForWindow(
  db: DbQueryable,
  params: { jobId: string; retryAt: Date }
): Promise<void> {
  const sql = `UPDATE billing_recurring_jobs
     SET status = 'pending',
         retry_at = $2,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`;
  await traceBillingJobMutation({
    db,
    jobId: params.jobId,
    phase: 'window_requeue_outside_local_window',
    operation: 'UPDATE',
    sql,
    binds: [params.jobId, params.retryAt.toISOString()],
    whereHint: 'id = $1',
    expectedStatus: 'pending',
    caller: {
      file: 'recurringBillingJobService.ts',
      line: 128,
      function: 'requeueBillingRecurringJobForWindow',
    },
    execute: () => db.query(sql, [params.jobId, params.retryAt.toISOString()]),
  });
  await subscriptionCyclesMarkQueued(db, params.jobId);
}

function buildWindowRequeueAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + WINDOW_REQUEUE_MINUTES * 60_000);
}

/** Linha mínima (subscription + tenant) para enfileirar job de renovação com janela Fase 2. */
export type RenewalEnqueueTenantJoinRow = {
  id: string;
  tenant_id: string;
  next_billing_date: string;
  billing_interval: string;
  tenant_timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  /** Dias antes do vencimento do ciclo para permitir enfileiramento (0 = no dia do vencimento). */
  recurring_invoice_generate_days_before_due: number;
};

/** SQL: dias efetivos de antecipação (tenant limitado pela periodicidade da assinatura). */
export const BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL = `LEAST(
  COALESCE(t.recurring_invoice_generate_days_before_due, 0),
  CASE s.billing_interval::text
    WHEN 'weekly' THEN 6
    WHEN 'monthly' THEN 30
    WHEN 'quarterly' THEN 92
    WHEN 'semi_annual' THEN 185
    WHEN 'yearly' THEN 365
    ELSE 30
  END
)`;

function schedulerCycleSchedulingMeta(
  row: RenewalEnqueueTenantJoinRow,
  cycleYmd: string
): Record<string, unknown> {
  const generate_days_before_due_tenant = clampRecurringInvoiceGenerateDaysBeforeDue(
    row.recurring_invoice_generate_days_before_due
  );
  const generate_days_before_due = effectiveRecurringGenerateDaysBeforeDue(
    row.recurring_invoice_generate_days_before_due,
    row.billing_interval
  );
  return {
    cycle_due_date: cycleYmd,
    billing_interval: row.billing_interval,
    generate_days_before_due_tenant,
    generate_days_before_due,
    generate_days_capped: isGenerateDaysBeforeCappedForInterval(
      row.recurring_invoice_generate_days_before_due,
      row.billing_interval
    ),
    generation_date: computeRecurringInvoiceGenerationDateYmd(cycleYmd, generate_days_before_due),
  };
}

/** Data civil em que o scheduler pode enfileirar (vencimento − antecipação efetiva). */
function renewalJobGenerationDateYmd(row: RenewalEnqueueTenantJoinRow, cycleDueYmd: string): string {
  return computeRecurringInvoiceGenerationDateYmd(
    cycleDueYmd,
    effectiveRecurringGenerateDaysBeforeDue(
      row.recurring_invoice_generate_days_before_due,
      row.billing_interval
    )
  );
}

/**
 * `scheduled_at` do worker: elegível na geração, não no vencimento (`cycle_key`).
 * Usa `now()` para pickup imediato após enqueue; `generation_date_ymd` só para logs/meta.
 */
function logBillingScheduledAtFixed(params: {
  subscription_id: string;
  tenant_id: string;
  cycle_key: string;
  generation_date_ymd: string;
  cycle_due_ymd: string;
  old_scheduled_at: string | null;
  new_scheduled_at: string;
  job_id: string;
  mode: 'insert' | 'reactivate';
}): void {
  console.log(
    '[BILLING_SCHEDULED_AT_FIXED]',
    JSON.stringify({
      ...params,
      scheduled_at_source: 'now_at_enqueue',
      ts: new Date().toISOString(),
    })
  );
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

  const schedulingMeta = schedulerCycleSchedulingMeta(row, cycleKeyCanonical);
  await materializePlannedCycles(db, {
    tenantId,
    subscriptionId,
    plans: planSchedulerEligibleCycle(cycleKeyCanonical),
    schedulingMeta,
  });

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

  const generationDateYmd = renewalJobGenerationDateYmd(row, cycleKeyCanonical);

  const existingR = await db.query<{ id: string; status: string; cycle_key: string; scheduled_at: string }>(
    `SELECT id::text, status, cycle_key, scheduled_at::text
     FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
     ORDER BY updated_at DESC
     LIMIT 1`,
    [subscriptionId, tenantId, cycleKeyCanonical]
  );
  const ex = existingR.rows[0];
  const has = await billingJobsTableHasOutcomeColumns(db);

  if (ex) {
    if (ex.status === 'cancelled' || ex.status === 'failed') {
      const oldScheduledAt = ex.scheduled_at ?? null;
      const reactivateR = has
        ? await db.query<{ scheduled_at: string }>(
            `UPDATE billing_recurring_jobs SET
              status = 'pending',
              cycle_key = $1,
              scheduled_at = now(),
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
             WHERE id = $2
             RETURNING scheduled_at::text`,
            [cycleKeyCanonical, ex.id]
          )
        : await db.query<{ scheduled_at: string }>(
            `UPDATE billing_recurring_jobs SET
              status = 'pending',
              cycle_key = $1,
              scheduled_at = now(),
              retry_at = NULL,
              locked_at = NULL,
              locked_by = NULL,
              error_message = NULL,
              result_invoice_id = NULL,
              result_invoice_type = NULL,
              attempts = 0,
              updated_at = now()
             WHERE id = $2
             RETURNING scheduled_at::text`,
            [cycleKeyCanonical, ex.id]
          );
      const newScheduledAt = reactivateR.rows[0]?.scheduled_at ?? new Date().toISOString();
      logBillingScheduledAtFixed({
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        cycle_key: cycleKeyCanonical,
        generation_date_ymd: generationDateYmd,
        cycle_due_ymd: cycleKeyCanonical,
        old_scheduled_at: oldScheduledAt,
        new_scheduled_at: newScheduledAt,
        job_id: ex.id,
        mode: 'reactivate',
      });
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
    const insR = await db.query<{ id: string; scheduled_at: string }>(
      `INSERT INTO billing_recurring_jobs (subscription_id, tenant_id, job_type, cycle_key, scheduled_at, status)
       VALUES ($1, $2, 'renewal', $3, now(), 'pending')
       RETURNING id::text, scheduled_at::text`,
      [subscriptionId, tenantId, cycleKeyCanonical]
    );
    const newJobId = insR.rows[0]?.id ?? null;
    if (newJobId) {
      logBillingScheduledAtFixed({
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        cycle_key: cycleKeyCanonical,
        generation_date_ymd: generationDateYmd,
        cycle_due_ymd: cycleKeyCanonical,
        old_scheduled_at: null,
        new_scheduled_at: insR.rows[0]?.scheduled_at ?? new Date().toISOString(),
        job_id: newJobId,
        mode: 'insert',
      });
      await subscriptionCyclesUpsertAfterScheduler(db, {
        tenantId,
        subscriptionId,
        cycleKeyCanonical,
        jobId: newJobId,
        schedulingMeta: schedulerCycleSchedulingMeta(row, cycleKeyCanonical),
      });
      subscriptionBillingLog('SUBSCRIPTION_PENDING_CREATED', 'scheduler_job_inserted', {
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        job_id: newJobId,
        cycle_key: cycleKeyCanonical,
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
  /** Fase 2: `next_billing_date` no calendário local da empresa é futuro em relação a “hoje” local. */
  | 'future_local_date'
  /** Fase 2: mesmo dia local, mas ainda antes de `recurring_generate_time_local`. */
  | 'too_early_local_time'
  /** Reservado para estados inesperados de janela (não deve ocorrer com a Fase 2 atual). */
  | 'outside_local_window'
  | 'active_job_exists'
  | 'completed_cycle_guard'
  /** B0.1: CRM sem customer_id reconstruível. */
  | 'customer_unresolvable';

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
      'No fuso horário da empresa, ainda não chegou o primeiro dia civil de geração (vencimento do ciclo menos dias de antecipação) — aguardar o dia local ou ajustar configuração.',
    too_early_local_time:
      'Mesmo dia local, mas ainda antes do horário de geração configurado na empresa (Fase 2).',
    outside_local_window: 'Fora da janela local de geração (Fase 2).',
    active_job_exists: 'Já existe job pendente ou em processamento para este ciclo (cycle_key).',
    completed_cycle_guard: 'Ciclo já consta como concluído na tabela de jobs — não reabre completed.',
    customer_unresolvable:
      'Assinatura CRM sem cliente vinculado e sem faturas que permitam reconstruir o customer_id.',
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
      customer_id: string | null;
    }
  >(
    `SELECT s.id, s.tenant_id, s.next_billing_date::text, s.billing_interval::text,
            s.status, s.type, s.customer_id::text,
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

  if (row.type === 'customer') {
    const customerProbe = await probeSubscriptionCustomerId(db, {
      id: row.id,
      tenant_id: row.tenant_id,
      customer_id: row.customer_id,
    });
    if (!customerProbe.ok) {
      return {
        ...base,
        cycle_key: canonicalYmd,
        db_eligible: false,
        block_reason: 'customer_unresolvable',
      };
    }
  }

  const eligibleR = await db.query<{ ok: boolean }>(
    `SELECT (
       (s.next_billing_date - ${BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL}) <= CURRENT_DATE
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
    billingInterval: row.billing_interval,
  });

  const joinRow: RenewalEnqueueTenantJoinRow = {
    id: row.id,
    tenant_id: row.tenant_id,
    next_billing_date: canonicalYmd,
    billing_interval: row.billing_interval || 'monthly',
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

export { diagnoseRenewal } from './renewalDiagnosisService.js';
export type { RenewalDiagnosis } from './renewalDiagnosisService.js';

/** Carrega linha para enfileiramento sem checagem de janela horária (manual / diagnóstico). */
export async function loadRenewalEnqueueJoinRow(
  db: DbQueryable,
  subscriptionId: string
): Promise<(RenewalEnqueueTenantJoinRow & { type: string; status: string; customer_id: string | null }) | null> {
  const r = await db.query(
    `SELECT s.id::text, s.tenant_id::text, s.next_billing_date::text, s.billing_interval::text,
            s.status, s.type, s.customer_id::text,
            t.timezone::text AS tenant_timezone,
            t.recurring_generate_time_local::text,
            t.invoice_notify_same_as_generation,
            t.invoice_notify_time_local::text,
            COALESCE(t.recurring_invoice_generate_days_before_due, 0)::int AS recurring_invoice_generate_days_before_due
     FROM subscriptions s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row?.id) return null;
  const canonicalYmd =
    normalizeBillingCycleKeyYmd(String(row.next_billing_date ?? '')) ||
    normalizeSubscriptionNextBillingYmd(String(row.next_billing_date ?? ''));
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    next_billing_date: canonicalYmd || String(row.next_billing_date ?? ''),
    billing_interval: String(row.billing_interval || 'monthly'),
    tenant_timezone: row.tenant_timezone != null ? String(row.tenant_timezone) : null,
    recurring_generate_time_local:
      row.recurring_generate_time_local != null ? String(row.recurring_generate_time_local) : null,
    invoice_notify_same_as_generation:
      row.invoice_notify_same_as_generation != null ? Boolean(row.invoice_notify_same_as_generation) : null,
    invoice_notify_time_local:
      row.invoice_notify_time_local != null ? String(row.invoice_notify_time_local) : null,
    recurring_invoice_generate_days_before_due: Number(row.recurring_invoice_generate_days_before_due ?? 0),
    type: String(row.type ?? ''),
    status: String(row.status ?? ''),
    customer_id: row.customer_id != null ? String(row.customer_id) : null,
  };
}

/** Executa um único job — modo automático (worker) ou manual (operador, ignora retry_at/janela). */
export type ExecuteRenewalJobOptions = {
  onlyJobId?: string;
  /** B0.2.1: execução síncrona pelo operador — sem filtros de scheduler/backoff/janela. */
  manualExecution?: boolean;
};

export type SynchronousRenewalJobResult = {
  processed: number;
  failed: number;
  cancelled: number;
  job_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  gateway_status: string | null;
  completion_outcome: string | null;
  error_message: string | null;
  cycle_key: string | null;
  job_status: string | null;
};

/** @deprecated Use executeRenewalJobSynchronously */
export async function executeRenewalJobById(
  jobId: string,
  workerId: string,
  manualExecution = false
): Promise<{ processed: number; failed: number; cancelled: number }> {
  const r = await executeRenewalJobSynchronously(jobId, workerId, { manualExecution });
  return { processed: r.processed, failed: r.failed, cancelled: r.cancelled };
}

/**
 * Executa um job de renovação de forma síncrona (manual ou worker com onlyJobId).
 * Manual: ignora retry_at, scheduled_at, backoff e janela horária local.
 */
export async function executeRenewalJobSynchronously(
  jobId: string,
  workerId: string,
  options: { manualExecution?: boolean } = {}
): Promise<SynchronousRenewalJobResult> {
  patchBillingJobTraceContext({
    worker_id: workerId,
    job_id: jobId,
    execution_mode: options.manualExecution ? 'manual' : 'automatic',
  });
  traceBillingJobPhase(
    'execute_renewal_job_synchronously_start',
    { job_id: jobId, worker_id: workerId, manual_execution: options.manualExecution ?? false },
    { file: 'recurringBillingJobService.ts', line: 888, function: 'executeRenewalJobSynchronously' }
  );

  const batch = await processNextBatch(workerId, {
    onlyJobId: jobId,
    manualExecution: options.manualExecution ?? false,
  });

  traceBillingJobPhase(
    'execute_renewal_job_synchronously_end',
    {
      job_id: jobId,
      processed: batch.processed,
      failed: batch.failed,
      cancelled: batch.cancelled,
    },
    { file: 'recurringBillingJobService.ts', line: 896, function: 'executeRenewalJobSynchronously' }
  );

  const snapR = await pool.query(
    `SELECT brj.status, brj.result_invoice_id::text, brj.error_message, brj.completion_outcome,
            brj.cycle_key, ci.invoice_number, ci.gateway_status
     FROM billing_recurring_jobs brj
     LEFT JOIN customer_invoices ci ON ci.id = brj.result_invoice_id
     WHERE brj.id = $1::uuid
     LIMIT 1`,
    [jobId]
  );
  const row = snapR.rows[0] as Record<string, unknown> | undefined;
  return {
    ...batch,
    job_id: jobId,
    invoice_id: row?.result_invoice_id != null ? String(row.result_invoice_id) : null,
    invoice_number: row?.invoice_number != null ? String(row.invoice_number) : null,
    gateway_status: row?.gateway_status != null ? String(row.gateway_status) : null,
    completion_outcome: row?.completion_outcome != null ? String(row.completion_outcome) : null,
    error_message: row?.error_message != null ? String(row.error_message) : null,
    cycle_key: row?.cycle_key != null ? String(row.cycle_key) : null,
    job_status: row?.status != null ? String(row.status) : null,
  };
}

/**
 * Tenta enfileirar um job de renovação para uma assinatura já elegível (mesma lógica do scheduler: CURRENT_DATE + janela local).
 * Usado após PATCH de `next_billing_date` para não depender apenas do próximo tick do cron.
 */
export async function tryEnqueueRenewalJobForSubscriptionId(
  subscriptionId: string
): Promise<TryEnqueueRenewalJobForSubscriptionResult> {
  return withBillingWorkerRlsBypass(async () => {
    try {
      const { applyPendingCrmSubscriptionContractIfDue } = await import('./crmSubscriptionsContractService.js');
      await applyPendingCrmSubscriptionContractIfDue(subscriptionId);
    } catch (e) {
      billingLog('scheduler', 'apply_pending_crm_contract_error', {
        subscription_id: subscriptionId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

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

    const enqueueRow = desc.enqueue_row;
    const cycleKey =
      normalizeBillingCycleKeyYmd(enqueueRow.next_billing_date) ||
      normalizeSubscriptionNextBillingYmd(enqueueRow.next_billing_date);
    await materializePlannedCycles(pool, {
      tenantId: enqueueRow.tenant_id,
      subscriptionId,
      plans: planSchedulerEligibleCycle(cycleKey),
      schedulingMeta: schedulerCycleSchedulingMeta(enqueueRow, cycleKey),
    });

    const outcome = await insertOrReactivateRenewalJob(pool, enqueueRow);
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
    const schedulerCtx: RenewalPipelineContextInput = {
      correlation_id: `scheduler-${crypto.randomUUID().slice(0, 8)}`,
      subscription_id: null,
      job_id: null,
      invoice_id: null,
      cycle_key: null,
      execution_mode: 'scheduler',
      started_at_ms: Date.now(),
    };
    const schedStart = emitRenewalPipelineStage(schedulerCtx, 'READINESS', { phase: 'scheduler_start' });
    const expired = await expireCancelledSubscriptions();

    const subs = await pool.query<{
      id: string;
      tenant_id: string;
      type: string;
      customer_id: string | null;
      next_billing_date: string;
      billing_interval: string;
      tenant_timezone: string | null;
      recurring_generate_time_local: string | null;
      invoice_notify_same_as_generation: boolean | null;
      invoice_notify_time_local: string | null;
      recurring_invoice_generate_days_before_due: number;
    }>(
      `SELECT s.id, s.tenant_id, s.type, s.customer_id::text, s.next_billing_date, s.billing_interval::text AS billing_interval,
              t.timezone::text AS tenant_timezone,
              t.recurring_generate_time_local::text,
              t.invoice_notify_same_as_generation,
              t.invoice_notify_time_local::text,
              COALESCE(t.recurring_invoice_generate_days_before_due, 0)::int AS recurring_invoice_generate_days_before_due
       FROM subscriptions s
       LEFT JOIN tenants t ON t.id = s.tenant_id
       WHERE s.status = 'active'
         AND (s.next_billing_date - ${BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL}) <= CURRENT_DATE
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
        billingInterval: row.billing_interval,
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

      if (row.type === 'customer') {
        const customerProbe = await probeSubscriptionCustomerId(pool, {
          id: row.id,
          tenant_id: row.tenant_id,
          customer_id: row.customer_id,
        });
        if (!customerProbe.ok) {
          skipped++;
          billingLog('scheduler', 'enqueue_skip_customer_unresolvable', {
            tenant_id: row.tenant_id,
            subscription_id: row.id,
          });
          continue;
        }
        if (!row.customer_id) {
          await resolveAndPersistSubscriptionCustomerId(pool, {
            id: row.id,
            tenant_id: row.tenant_id,
            customer_id: row.customer_id,
          });
        }
      }

      const joinRow: RenewalEnqueueTenantJoinRow = {
        id: row.id,
        tenant_id: row.tenant_id,
        next_billing_date: cycleKey,
        billing_interval: row.billing_interval || 'monthly',
        tenant_timezone: row.tenant_timezone,
        recurring_generate_time_local: row.recurring_generate_time_local,
        invoice_notify_same_as_generation: row.invoice_notify_same_as_generation,
        invoice_notify_time_local: row.invoice_notify_time_local,
        recurring_invoice_generate_days_before_due: row.recurring_invoice_generate_days_before_due,
      };
      await materializePlannedCycles(pool, {
        tenantId: row.tenant_id,
        subscriptionId: row.id,
        plans: planSchedulerEligibleCycle(cycleKey),
        schedulingMeta: schedulerCycleSchedulingMeta(joinRow, cycleKey),
      });
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
    emitRenewalPipelineStageEnd(schedulerCtx, 'READINESS', schedStart, {
      enqueued,
      skipped,
      expired,
    });
    emitRenewalPipelineStage(schedulerCtx, 'COMPLETE', { enqueued, skipped, expired });
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

/**
 * Worker: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Valida subscription (active, janela local de geração antecipada, cancel_at_period_end); cria fatura; chama gateway; atualiza subscription (last_job_at, next_billing_date, etc.) e job.
 */
export async function processNextBatch(
  workerId: string,
  options?: ExecuteRenewalJobOptions
): Promise<{ processed: number; failed: number; cancelled: number }> {
  return withBillingWorkerRlsBypass(async () => {
    const client = dbRequestStorage.getStore()?.client;
    if (!client) {
      throw new Error('billing worker RLS context missing');
    }
    const result = { processed: 0, failed: 0, cancelled: 0 };

    traceBillingJobPhase(
      'process_next_batch_start',
      {
        worker_id: workerId,
        manual_execution: options?.manualExecution ?? false,
        only_job_id: options?.onlyJobId ?? null,
        branch: options?.manualExecution ? 'manual' : 'worker',
      },
      { file: 'recurringBillingJobService.ts', line: 1244, function: 'processNextBatch' }
    );

    if (options?.manualExecution && options.onlyJobId) {
      const manualPrepareSql = `UPDATE billing_recurring_jobs
         SET status = 'pending',
             scheduled_at = now(),
             retry_at = NULL,
             locked_at = NULL,
             locked_by = NULL,
             updated_at = now()
         WHERE id = $1::uuid AND status IN ${MANUAL_JOB_PREPARE_STATUSES_SQL}`;
      await traceBillingJobMutation({
        db: client,
        jobId: options.onlyJobId,
        phase: 'manual_execution_job_prepared',
        operation: 'UPDATE',
        sql: manualPrepareSql,
        binds: [options.onlyJobId],
        whereHint: `id = $1 AND status IN ${MANUAL_JOB_PREPARE_STATUSES_SQL}`,
        expectedStatus: 'pending',
        caller: {
          file: 'recurringBillingJobService.ts',
          line: 1255,
          function: 'processNextBatch',
        },
        execute: () => client.query(manualPrepareSql, [options.onlyJobId]),
      });
      billingLog('job', 'manual_execution_job_prepared', {
        jobId: options.onlyJobId,
        workerId,
      });
    }

    const reclaimed = options?.manualExecution ? 0 : await reclaimStaleBillingProcessingJobs(client, workerId);
    const locksCleared = options?.manualExecution ? 0 : await sanitizePendingBillingJobLocks(client, workerId);
    if (!options?.manualExecution) {
      traceBillingJobPhase(
        'worker_branch_reclaim_and_diagnostic',
        { reclaimed, locks_cleared: locksCleared, worker_id: workerId },
        { file: 'recurringBillingJobService.ts', line: 1273, function: 'processNextBatch' }
      );
      await emitBillingWorkerBatchDiagnostic(client, workerId, reclaimed, locksCleared);
    }

    const manualSelectSql = `SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
             FROM billing_recurring_jobs
             WHERE id = $1::uuid AND status = 'pending'
             LIMIT 1
             FOR UPDATE`;
    const onlyJobSelectSql = `SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
               FROM billing_recurring_jobs
               WHERE id = $1::uuid AND status = 'pending'
                 AND scheduled_at <= now()
                 AND (retry_at IS NULL OR retry_at <= now())
               LIMIT 1
               FOR UPDATE`;
    const workerBatchSelectSql = `SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
               FROM billing_recurring_jobs
               WHERE status = 'pending'
                 AND scheduled_at <= now()
                 AND (retry_at IS NULL OR retry_at <= now())
               ORDER BY scheduled_at ASC
               LIMIT $1
               FOR UPDATE SKIP LOCKED`;

    const selectStarted = Date.now();
    const jobsResult =
      options?.manualExecution && options.onlyJobId
        ? await client.query<JobRow>(manualSelectSql, [options.onlyJobId])
        : options?.onlyJobId
          ? await client.query<JobRow>(onlyJobSelectSql, [options.onlyJobId])
          : await client.query<JobRow>(workerBatchSelectSql, [WORKER_BATCH_SIZE]);
    const selectDuration = Date.now() - selectStarted;

    const selectSql =
      options?.manualExecution && options.onlyJobId
        ? manualSelectSql
        : options?.onlyJobId
          ? onlyJobSelectSql
          : workerBatchSelectSql;
    const selectBinds =
      options?.manualExecution && options.onlyJobId
        ? [options.onlyJobId]
        : options?.onlyJobId
          ? [options.onlyJobId]
          : [WORKER_BATCH_SIZE];

    traceBillingJobSelect({
      phase: options?.manualExecution ? 'manual_batch_select_for_update' : 'worker_batch_select_for_update',
      sql: selectSql,
      binds: selectBinds,
      rows: jobsResult.rows.map((j) => ({
        id: j.id,
        status: j.status,
        retry_at: j.retry_at,
        subscription_id: j.subscription_id,
      })),
      forUpdate: true,
      duration_ms: selectDuration,
      caller: { file: 'recurringBillingJobService.ts', line: 1279, function: 'processNextBatch' },
    });

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
      traceEngineNotReached('process_next_batch_empty', {
        worker_id: workerId,
        manual_execution: options?.manualExecution ?? false,
        only_job_id: options?.onlyJobId ?? null,
        pending_in_backoff: backoffCount,
        caller: { file: 'recurringBillingJobService.ts', line: 1312, function: 'processNextBatch' },
      });
    }
    billingLog('worker', 'batch_start', { workerId, batchSize: jobs.length });

    for (const job of jobs) {
      const processingSql = `UPDATE billing_recurring_jobs SET status = 'processing', locked_at = now(), locked_by = $1, updated_at = now() WHERE id = $2`;
      await traceBillingJobMutation({
        db: client,
        jobId: job.id,
        subscriptionId: job.subscription_id,
        phase: 'job_lock_processing',
        operation: 'UPDATE',
        sql: processingSql,
        binds: [workerId, job.id],
        whereHint: 'id = $2',
        expectedStatus: 'processing',
        caller: { file: 'recurringBillingJobService.ts', line: 1340, function: 'processNextBatch' },
        execute: () => client.query(processingSql, [workerId, job.id]),
      });
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
      subscriptionBillingLog('SUBSCRIPTION_PROCESSING', 'job_pickup', {
        tenant_id: job.tenant_id,
        subscription_id: job.subscription_id,
        job_id: job.id,
        cycle_key: jobCycleCanonical,
        attempts: job.attempts,
        worker_id: workerId,
      });
      logRenewalAttemptTrace({
        phase: 'worker_pickup',
        subscription_id: job.subscription_id,
        tenant_id: job.tenant_id,
        job_id: job.id,
        worker_id: workerId,
        cycle_key: jobCycleCanonical,
        attempt: job.attempts + 1,
        max_attempts: job.max_attempts,
        retry_at: job.retry_at,
      });

      const jobStartedAt = Date.now();
      const executionMode = options?.manualExecution ? 'manual' : 'automatic';
      const pipelineCtx: RenewalPipelineContextInput = {
        correlation_id: `${executionMode}-${job.id}-${crypto.randomUUID().slice(0, 8)}`,
        subscription_id: job.subscription_id,
        job_id: job.id,
        invoice_id: null,
        cycle_key: jobCycleCanonical,
        execution_mode: executionMode,
        started_at_ms: jobStartedAt,
      };
      const pickupMs = emitRenewalPipelineStage(pipelineCtx, 'JOB_PICKUP', {
        worker_id: workerId,
        attempt: job.attempts + 1,
      });
      emitRenewalPipelineStageEnd(pipelineCtx, 'JOB_PICKUP', pickupMs, { worker_id: workerId });

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
        if (
          subNextYmd &&
          jobCycleCanonical &&
          subNextYmd !== jobCycleCanonical &&
          !options?.manualExecution
        ) {
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
        if (
          options?.manualExecution &&
          subNextYmd &&
          jobCycleCanonical &&
          subNextYmd !== jobCycleCanonical
        ) {
          billingLog('job', 'manual_execution_cycle_mismatch_bypass', {
            workerId,
            jobId: job.id,
            subscription_id: job.subscription_id,
            job_cycle_key: jobCycleCanonical,
            subscription_next_billing: subNextYmd,
          });
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
          billingInterval: subscription.billing_interval,
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

        if (!options?.manualExecution && !diag.would_be_eligible_by_window) {
          const retryAt = buildWindowRequeueAt(new Date());
          subscriptionBillingLog('SUBSCRIPTION_ELIGIBLE', 'worker_requeue_outside_local_window', {
            tenant_id: job.tenant_id,
            subscription_id: subscription.id,
            job_id: job.id,
            window_reason: diag.reason,
            timezone_effective: diag.timezone_effective,
            local_now_ymd: diag.local_now_ymd,
            local_now_hhmm: diag.local_now_hhmm,
            generate_time_local: diag.generate_time_local_effective,
            next_billing_date: cycleDueYmd,
            retry_at: retryAt.toISOString(),
          });
          await requeueBillingRecurringJobForWindow(client, {
            jobId: job.id,
            retryAt,
          });
          logRenewalAttemptTrace({
            phase: 'worker_window_requeue',
            subscription_id: subscription.id,
            tenant_id: job.tenant_id,
            job_id: job.id,
            worker_id: workerId,
            cycle_key: jobCycleCanonical,
            period_start: jobCycleCanonical,
            due_date: cycleDueYmd,
            generation_date_ymd: diag.generation_date_ymd,
            generate_days_before_due_tenant: diag.recurring_generate_days_before_due_tenant,
            generate_days_before_due_effective: diag.recurring_generate_days_before_due,
            generate_days_capped: diag.generate_days_capped_for_interval,
            contract_interval: subscription.billing_interval,
            retry_at: retryAt.toISOString(),
            result: diag.reason,
            duration_ms: Date.now() - jobStartedAt,
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
            await client.query(
              `UPDATE subscriptions
               SET amount_cents = $1::int, updated_at = now()
               WHERE id = $2::uuid AND tenant_id = $3::uuid`,
              [existingInvoice.amount_cents, subscription.id, subscription.tenant_id]
            );
            billingLog('job', 'saas_idempotent_subscription_amount_sync', {
              jobId: job.id,
              subscription_id: subscription.id,
              tenant_id: subscription.tenant_id,
              invoice_id: existingInvoice.id,
              amount_cents: existingInvoice.amount_cents,
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
            await ensureBillingChargeNotificationExists(existingInvoice.id);
            result.processed++;
            continue;
          }
          emitRenewalPipelineStage(pipelineCtx, 'ENGINE_START', { subscription_type: 'saas' });
          const saasRenewalResult = await BillingRenewalEngine.execute({
            client,
            subscriptionId: subscription.id,
            cycleKey: jobCycleCanonical,
            executionMode: options?.manualExecution ? 'manual' : 'automatic',
            jobId: job.id,
            workerId,
            subscription,
            periodStartYmd,
            correlationId: pipelineCtx.correlation_id,
            options: {
              job_type: job.job_type,
              scheduled_at: job.scheduled_at,
              retry_at: job.retry_at,
              status: job.status,
              attempts: job.attempts,
              max_attempts: job.max_attempts,
            },
          });
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
          emitRenewalPipelineStage(pipelineCtx, 'ENGINE_START', { subscription_type: 'customer', pipeline: 'v2' });
          const customerRenewalResult = await executeWorkerCrmRenewal({
            client,
            job: {
              id: job.id,
              subscription_id: job.subscription_id,
              tenant_id: job.tenant_id,
              job_type: job.job_type,
              cycle_key: jobCycleCanonical,
              scheduled_at: job.scheduled_at,
              retry_at: job.retry_at,
              status: job.status,
              attempts: job.attempts,
              max_attempts: job.max_attempts,
            },
            subscription,
            periodStartYmd,
            cycleKey: jobCycleCanonical,
            executionMode: options?.manualExecution ? 'manual' : 'automatic',
            correlationId: pipelineCtx.correlation_id,
            workerId,
          });
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
        emitRenewalPipelineStage(pipelineCtx, 'COMPLETE', {
          duration_ms: Date.now() - jobStartedAt,
        });
        void recordRenewalHistory(
          buildRenewalHistoryRecord({
            execution_mode: executionMode,
            subscription_id: job.subscription_id,
            tenant_id: job.tenant_id,
            job_id: job.id,
            invoice_id: null,
            cycle_key: jobCycleCanonical,
            correlation_id: pipelineCtx.correlation_id,
            started_at: safeToISOString(new Date(jobStartedAt)) ?? safeNowIso(),
            finished_at: safeNowIso(),
            success: true,
            result: 'completed',
          })
        );
      } catch (err) {
        emitRenewalPipelineError(pipelineCtx, 'ENGINE_START', err, {
          worker_id: workerId,
        });
        const classified = classifyRenewalError(err);
        const structuredErr = classifyBillingRenewalError({
          error_code:
            err instanceof RenewalHardeningError ? classified.reason_code : 'renewal_job_failed',
          reason: classified.message,
          stage: 'ENGINE_START',
          correlation_id: pipelineCtx.correlation_id,
          subscription_id: job.subscription_id,
          job_id: job.id,
          execution_mode: executionMode,
          cycle_key: jobCycleCanonical,
          retryable: shouldRetryRenewalError(err, job.attempts + 1, job.max_attempts),
        });
        logBillingRenewalError(
          structuredErr,
          err instanceof Error ? err.stack : undefined
        );
        const errMsg = classified.message;
        const permanent = isPermanentRenewalError(err);
        const attempts = permanent ? job.max_attempts : job.attempts + 1;
        const willRetry = shouldRetryRenewalError(err, attempts, job.max_attempts);
        const correlationId =
          err instanceof RenewalHardeningError
            ? undefined
            : `worker-err-${job.id}-${Date.now()}`;
        billingLog('job', 'job_error', {
          jobId: job.id,
          subscriptionId: job.subscription_id,
          tenantId: job.tenant_id,
          cycle_key_raw: job.cycle_key,
          cycle_key_normalized: normalizeBillingCycleKeyYmd(job.cycle_key),
          error: errMsg,
          error_category: classified.category,
          permanent_failure: permanent,
          critical_log: classified.critical_log,
        });
        if (classified.critical_log) {
          console.error('[RENEWAL_CRITICAL]', JSON.stringify({
            job_id: job.id,
            subscription_id: job.subscription_id,
            category: classified.category,
            reason_code: classified.reason_code,
            error: errMsg.slice(0, 2000),
          }));
        }
        subscriptionBillingLog('SUBSCRIPTION_INVOICE_FAILED', 'job_processing_error', {
          tenant_id: job.tenant_id,
          subscription_id: job.subscription_id,
          job_id: job.id,
          cycle_key: normalizeBillingCycleKeyYmd(job.cycle_key),
          error: errMsg.slice(0, 2000),
          attempts,
          error_category: classified.category,
          permanent_failure: permanent,
          final_failure: !willRetry,
        });
        logRenewalAttemptTrace({
          phase: 'worker_error',
          subscription_id: job.subscription_id,
          tenant_id: job.tenant_id,
          job_id: job.id,
          worker_id: workerId,
          cycle_key: normalizeBillingCycleKeyYmd(job.cycle_key),
          attempt: attempts,
          max_attempts: job.max_attempts,
          exception: errMsg.slice(0, 2000),
          error_category: classified.category,
          result: willRetry ? 'retry_scheduled' : permanent ? 'failed_permanent' : 'failed_max_attempts',
          duration_ms: Date.now() - jobStartedAt,
          correlation_id: correlationId,
        });
        const retryAt = new Date();
        if (attempts === 1) retryAt.setHours(retryAt.getHours() + 1);
        else if (attempts === 2) retryAt.setDate(retryAt.getDate() + 1);
        else retryAt.setDate(retryAt.getDate() + 3);
        const status = willRetry ? 'pending' : 'failed';
        const failureOutcome = permanent
          ? BILLING_RECURRING_JOB_OUTCOME.FAILED_PERMANENT_CONFIGURATION
          : BILLING_RECURRING_JOB_OUTCOME.FAILED_MAX_ATTEMPTS;
        const hasOc = await billingJobsTableHasOutcomeColumns(client);
        if (hasOc && status === 'failed') {
          const failSql = `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4,
              locked_at = NULL, locked_by = NULL,
              completion_outcome = $6, completion_detail = NULL, updated_at = now() WHERE id = $5`;
          const failBinds = [status, attempts, retryAt.toISOString(), errMsg, job.id, failureOutcome];
          await traceBillingJobMutation({
            db: client,
            jobId: job.id,
            subscriptionId: job.subscription_id,
            phase: 'job_failed_final_update',
            operation: 'UPDATE',
            sql: failSql,
            binds: failBinds,
            whereHint: 'id = $5',
            expectedStatus: status,
            caller: { file: 'recurringBillingJobService.ts', line: 1857, function: 'processNextBatch' },
            execute: () => client.query(failSql, failBinds),
          });
        } else {
          const retrySql = `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4,
              locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = $5`;
          const retryBinds = [status, attempts, retryAt.toISOString(), errMsg, job.id];
          await traceBillingJobMutation({
            db: client,
            jobId: job.id,
            subscriptionId: job.subscription_id,
            phase: willRetry ? 'job_retry_scheduled_update' : 'job_failed_update',
            operation: 'UPDATE',
            sql: retrySql,
            binds: retryBinds,
            whereHint: 'id = $5',
            expectedStatus: status,
            caller: { file: 'recurringBillingJobService.ts', line: 1864, function: 'processNextBatch' },
            execute: () => client.query(retrySql, retryBinds),
          });
        }
        if (status === 'failed') {
          notifyBillingJobFailed(job.id, job.subscription_id, job.tenant_id, errMsg);
          billingLog('job', 'job_failed_final', {
            jobId: job.id,
            subscriptionId: job.subscription_id,
            attempts,
            error_category: classified.category,
            permanent_failure: permanent,
          });
        } else {
          billingLog('job', 'job_retry_scheduled', {
            jobId: job.id,
            subscriptionId: job.subscription_id,
            attempts,
            retryAt: retryAt.toISOString(),
            error_category: classified.category,
          });
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
    traceBillingJobPhase(
      'process_next_batch_end',
      { worker_id: workerId, ...result, manual_execution: options?.manualExecution ?? false },
      { file: 'recurringBillingJobService.ts', line: 1923, function: 'processNextBatch' }
    );
    return result;
  });
}

type ProcessChildInvoicesResult = { created: number; skipped: number; errors: number };

type CustomerItemRecurringInterval =
  | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

function calculateNextItemDueDate(periodStart: string, interval: CustomerItemRecurringInterval): string {
  const d = new Date(periodStart + 'T12:00:00Z');
  const anchorDay = d.getUTCDate();
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  switch (interval) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10);
    case 'monthly': m += 1; break;
    case 'quarterly': m += 3; break;
    case 'semi_annual': m += 6; break;
    case 'yearly': y += 1; break;
    default: m += 1;
  }
  if (m > 11) { y += Math.floor(m / 12); m = m % 12; }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  const next = new Date(Date.UTC(y, m, day));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

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
