/**
 * Ações manuais de renovação CRM (B0.2) — reutiliza o mesmo pipeline do scheduler/worker.
 */
import crypto from 'node:crypto';
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import {
  BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE,
  executeRenewalJobSynchronously,
  insertOrReactivateRenewalJob,
  loadRenewalEnqueueJoinRow,
  normalizeBillingCycleKeyYmd,
} from './recurringBillingJobService.js';
import { flushBillingNotificationSideEffects } from './notificationsEngine/billingNotificationFlush.js';
import {
  assessManualGenerateReadiness,
  assessManualGenerateUnblocked,
  diagnoseRenewalForTenant,
  type RenewalDiagnosis,
} from './renewalDiagnosisService.js';
import { resolveAndPersistSubscriptionCustomerId } from './renewalCustomerResolution.js';
import {
  patchBillingJobTraceContext,
  runWithBillingJobTraceContext,
  traceBillingJobMutation,
  traceBillingJobPhase,
  traceEngineNotReached,
} from './billingJobLifecycleTrace.js';
import {
  MANUAL_JOB_PREPARE_STATUSES_SQL,
  runWithRenewalPipeline,
  traceRenewalPipelineStage,
  traceRenewalPipelineStageEnd,
  traceRenewalPipelineError,
  patchRenewalPipelineContext,
} from './renewalPipelineTrace.js';

export type ManualRenewalExecutionMode = 'MANUAL_GENERATE' | 'MANUAL_REPROCESS';

export type ManualRenewalActionResult = ManualBillingExecutionResult;

/** Resposta B0.2.1 / V2 Fase 1 — execução síncrona com erro estruturado. */
export type ManualBillingExecutionResult = {
  success: boolean;
  job_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  gateway_status: string | null;
  notification_sent: boolean;
  subscription_status: string | null;
  cycle_key: string | null;
  execution_mode: 'manual';
  duration_ms: number;
  message: string;
  result: string;
  /** Código estável para UI e logs (ex.: JOB_NOT_PICKED, READINESS_BLOCKED). */
  error_code?: string | null;
  /** Estágio do pipeline onde ocorreu falha ou conclusão. */
  stage?: string | null;
  /** Motivo legível / técnico curto. */
  reason?: string | null;
  repaired_fields: string[];
  logs: string[];
  diagnosis?: RenewalDiagnosis;
  correlation_id?: string;
};

export type ManualRenewalStatus = {
  can_generate_now: boolean;
  can_reprocess: boolean;
  generate_blockers: string[];
  reprocess_job: {
    id: string;
    status: string;
    cycle_key: string;
    error_message: string | null;
    attempts: number;
    max_attempts: number;
    retry_at: string | null;
    updated_at: string;
    result_invoice_id: string | null;
  } | null;
  processing_job_id: string | null;
  diagnosis: RenewalDiagnosis;
};

type ActorContext = {
  user_id: string;
  user_name: string | null;
  ip: string | null;
};

function logManualRenewal(fields: Record<string, string | number | boolean | null | undefined>): void {
  console.log('[MANUAL_RENEWAL]', JSON.stringify({ ts: new Date().toISOString(), execution_mode: 'manual', ...fields }));
}

function logBillingManual(
  action: 'generate_now' | 'reprocess',
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  console.log(
    '[BILLING_MANUAL]',
    JSON.stringify({
      action,
      ts: new Date().toISOString(),
      ...fields,
    })
  );
}

async function insertManualRenewalAudit(params: {
  action: ManualRenewalExecutionMode;
  subscriptionId: string;
  tenantId: string;
  jobId: string | null;
  invoiceId: string | null;
  actor: ActorContext;
  success: boolean;
  message: string;
  durationMs: number;
  correlationId: string;
}): Promise<void> {
  const detail = {
    actor_user_id: params.actor.user_id,
    actor_name: params.actor.user_name,
    ip: params.actor.ip,
    execution_mode: params.action,
    subscription_id: params.subscriptionId,
    tenant_id: params.tenantId,
    job_id: params.jobId,
    invoice_id: params.invoiceId,
    success: params.success,
    message: params.message,
    duration_ms: params.durationMs,
    correlation_id: params.correlationId,
  };
  try {
    await pool.query(
      `INSERT INTO billing_recovery_audit (run_id, action_type, entity_type, entity_id, dry_run, detail)
       VALUES ($1::uuid, $2, 'subscription', $3, false, $4::jsonb)`,
      [crypto.randomUUID(), params.action, params.subscriptionId, JSON.stringify(detail)]
    );
  } catch (e) {
    billingLog('job', 'manual_renewal_audit_insert_failed', {
      subscription_id: params.subscriptionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function loadJobSnapshot(jobId: string): Promise<{
  status: string;
  result_invoice_id: string | null;
  error_message: string | null;
  completion_outcome: string | null;
} | null> {
  const r = await pool.query(
    `SELECT status, result_invoice_id::text, error_message, completion_outcome
     FROM billing_recurring_jobs WHERE id = $1::uuid LIMIT 1`,
    [jobId]
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    status: String(row.status ?? ''),
    result_invoice_id: row.result_invoice_id != null ? String(row.result_invoice_id) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    completion_outcome: row.completion_outcome != null ? String(row.completion_outcome) : null,
  };
}

async function findProcessingJobId(subscriptionId: string, tenantId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid AND status = 'processing'
     LIMIT 1`,
    [subscriptionId, tenantId]
  );
  return (r.rows[0] as { id?: string } | undefined)?.id ?? null;
}

async function cycleHasInvoiceForKey(
  subscriptionId: string,
  tenantId: string,
  cycleKey: string
): Promise<boolean> {
  const cycleYmd = normalizeBillingCycleKeyYmd(cycleKey) || cycleKey.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleYmd)) return false;
  const r = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM customer_invoices ci
       WHERE ci.tenant_id = $1::uuid
         AND ci.subscription_id = $2::uuid
         AND ci.period_start::date = $3::date
         AND ci.status NOT IN ('cancelled', 'refunded')
     ) AS ok`,
    [tenantId, subscriptionId, cycleYmd]
  );
  return Boolean(r.rows[0]?.ok);
}

async function reactivateJobForManualGenerate(jobId: string): Promise<void> {
  const sql = `UPDATE billing_recurring_jobs
     SET status = 'pending',
         scheduled_at = now(),
         retry_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         error_message = NULL,
         completion_outcome = NULL,
         updated_at = now()
     WHERE id = $1::uuid
       AND result_invoice_id IS NULL
       AND status IN ('completed', 'failed', 'cancelled')`;
  await pool.query(sql, [jobId]);
}

async function findReprocessableJob(
  subscriptionId: string,
  tenantId: string,
  cycleKey: string
): Promise<ManualRenewalStatus['reprocess_job']> {
  const r = await pool.query(
    `SELECT id::text, status, cycle_key, error_message, attempts, max_attempts,
            retry_at::text, updated_at::text, result_invoice_id::text
     FROM billing_recurring_jobs
     WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid
       AND ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
       AND status IN ('pending', 'failed')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [subscriptionId, tenantId, cycleKey]
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    status: String(row.status ?? ''),
    cycle_key: String(row.cycle_key ?? ''),
    error_message: row.error_message != null ? String(row.error_message) : null,
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    retry_at: row.retry_at != null ? String(row.retry_at) : null,
    updated_at: String(row.updated_at ?? ''),
    result_invoice_id: row.result_invoice_id != null ? String(row.result_invoice_id) : null,
  };
}

export async function getManualRenewalStatus(
  tenantId: string,
  subscriptionId: string
): Promise<ManualRenewalStatus> {
  const diagnosis = await diagnoseRenewalForTenant(tenantId, subscriptionId);
  const readiness = assessManualGenerateReadiness(diagnosis);
  const cycleKey =
    normalizeBillingCycleKeyYmd(diagnosis.dates.next_billing_date ?? '') ||
    diagnosis.dates.job_cycle_key ||
    '';
  const processing_job_id = await findProcessingJobId(subscriptionId, tenantId);
  const reprocess_job = cycleKey ? await findReprocessableJob(subscriptionId, tenantId, cycleKey) : null;
  const can_reprocess =
    processing_job_id == null &&
    reprocess_job != null &&
    (reprocess_job.status === 'failed' ||
      reprocess_job.status === 'pending' ||
      (reprocess_job.retry_at != null && reprocess_job.status === 'pending'));

  return {
    can_generate_now: !diagnosis.cycle_invoice?.exists && diagnosis.validation.status === 'active',
    can_reprocess,
    generate_blockers: readiness.blockers,
    reprocess_job,
    processing_job_id,
    diagnosis,
  };
}

async function prepareJobForImmediateRun(jobId: string): Promise<void> {
  const sql = `UPDATE billing_recurring_jobs
     SET status = 'pending',
         scheduled_at = now(),
         retry_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE id = $1::uuid AND status IN ${MANUAL_JOB_PREPARE_STATUSES_SQL}`;
  await traceBillingJobMutation({
    db: pool,
    jobId,
    phase: 'prepare_immediate_run',
    operation: 'UPDATE',
    sql,
    binds: [jobId],
    whereHint: `id = $1 AND status IN ${MANUAL_JOB_PREPARE_STATUSES_SQL}`,
    expectedStatus: 'pending',
    caller: { file: 'billingManualRenewalService.ts', line: 227, function: 'prepareJobForImmediateRun' },
    execute: () => pool.query(sql, [jobId]),
  });
}

async function ensureJobForManualGenerate(
  subscriptionId: string,
  tenantId: string
): Promise<{ job_id: string; mode: 'inserted' | 'reactivated' | 'reused_pending' }> {
  return withBillingWorkerRlsBypass(async () => {
    traceBillingJobPhase(
      'ensure_job_for_manual_generate_start',
      { subscription_id: subscriptionId, tenant_id: tenantId },
      { file: 'billingManualRenewalService.ts', line: 234, function: 'ensureJobForManualGenerate' }
    );
    const join = await loadRenewalEnqueueJoinRow(pool, subscriptionId);
    if (!join || join.tenant_id !== tenantId) {
      throw new Error('Assinatura não encontrada');
    }
    if (join.status !== 'active' || join.type !== 'customer') {
      throw new Error('Assinatura não elegível para renovação manual');
    }

    const processing = await findProcessingJobId(subscriptionId, tenantId);
    if (processing) {
      await prepareJobForImmediateRun(processing);
      traceBillingJobPhase(
        'ensure_job_reclaimed_processing',
        { job_id: processing, subscription_id: subscriptionId },
        { file: 'billingManualRenewalService.ts', line: 268, function: 'ensureJobForManualGenerate' }
      );
      return { job_id: processing, mode: 'reused_pending' };
    }

    if (!join.customer_id) {
      await resolveAndPersistSubscriptionCustomerId(pool, {
        id: subscriptionId,
        tenant_id: tenantId,
        customer_id: null,
      });
    }

    try {
      const { applyPendingCrmSubscriptionContractIfDue } = await import('./crmSubscriptionsContractService.js');
      await applyPendingCrmSubscriptionContractIfDue(subscriptionId);
    } catch {
      /* não bloqueia — worker também trata */
    }

    const cycleKey = normalizeBillingCycleKeyYmd(join.next_billing_date) || join.next_billing_date;

    const pendingR = await pool.query(
      `SELECT id::text FROM billing_recurring_jobs
       WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
         AND status = 'pending'
       LIMIT 1`,
      [subscriptionId, tenantId, cycleKey]
    );
    const pendingId = (pendingR.rows[0] as { id?: string } | undefined)?.id;
    if (pendingId) {
      await prepareJobForImmediateRun(pendingId);
      traceBillingJobPhase(
        'ensure_job_for_manual_generate_end',
        { job_id: pendingId, mode: 'reused_pending' },
        { file: 'billingManualRenewalService.ts', line: 277, function: 'ensureJobForManualGenerate' }
      );
      return { job_id: pendingId, mode: 'reused_pending' };
    }

    const outcome = await insertOrReactivateRenewalJob(pool, join);
    if (outcome === 'skipped_active_exists') {
      const activeR = await pool.query(
        `SELECT id::text, status FROM billing_recurring_jobs
         WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
           AND status IN ('pending', 'processing')
         LIMIT 1`,
        [subscriptionId, tenantId, cycleKey]
      );
      const active = activeR.rows[0] as { id?: string; status?: string } | undefined;
      if (active?.status === 'processing' && active?.id) {
        await prepareJobForImmediateRun(active.id);
        traceBillingJobPhase(
          'ensure_job_for_manual_generate_end',
          { job_id: active.id, mode: 'reused_pending', prior_status: 'processing' },
          { file: 'billingManualRenewalService.ts', line: 318, function: 'ensureJobForManualGenerate' }
        );
        return { job_id: active.id, mode: 'reused_pending' };
      }
      if (active?.id) {
        await prepareJobForImmediateRun(active.id);
        traceBillingJobPhase(
          'ensure_job_for_manual_generate_end',
          { job_id: active.id, mode: 'reused_pending', prior_status: active.status },
          { file: 'billingManualRenewalService.ts', line: 312, function: 'ensureJobForManualGenerate' }
        );
        return { job_id: active.id, mode: 'reused_pending' };
      }
      throw new Error('Não foi possível obter job pendente para o ciclo atual');
    }
    if (outcome === 'skipped_completed_cycle') {
      const hasInvoice = await cycleHasInvoiceForKey(subscriptionId, tenantId, cycleKey);
      if (!hasInvoice) {
        const reviveR = await pool.query<{ id: string }>(
          `SELECT id::text FROM billing_recurring_jobs
           WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
             AND status IN ('completed', 'failed', 'cancelled')
             AND result_invoice_id IS NULL
           ORDER BY updated_at DESC LIMIT 1`,
          [subscriptionId, tenantId, cycleKey]
        );
        const reviveId = reviveR.rows[0]?.id;
        if (reviveId) {
          await reactivateJobForManualGenerate(reviveId);
          return { job_id: reviveId, mode: 'reactivated' };
        }
      }
      throw new Error('O ciclo atual já foi processado com sucesso — não há nova cobrança a gerar');
    }

    const jobR = await pool.query(
      `SELECT id::text FROM billing_recurring_jobs
       WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
       ORDER BY updated_at DESC LIMIT 1`,
      [subscriptionId, tenantId, cycleKey]
    );
    const jobId = (jobR.rows[0] as { id?: string } | undefined)?.id;
    if (!jobId) throw new Error('Falha ao criar job de renovação');
    await prepareJobForImmediateRun(jobId);
    const mode = outcome === 'inserted' ? 'inserted' : 'reactivated';
    traceBillingJobPhase(
      'ensure_job_for_manual_generate_end',
      { job_id: jobId, mode, insert_outcome: outcome },
      { file: 'billingManualRenewalService.ts', line: 330, function: 'ensureJobForManualGenerate' }
    );
    return {
      job_id: jobId,
      mode,
    };
  });
}

function buildWorkerId(actor: ActorContext): string {
  return `manual:${actor.user_id}:${crypto.randomUUID().slice(0, 8)}`;
}

function resultMessageFromJobSnapshot(
  snap: Awaited<ReturnType<typeof loadJobSnapshot>>,
  batch: { processed: number; failed: number; cancelled: number }
): { success: boolean; result: string; message: string; invoice_id: string | null } {
  if (!snap) {
    return { success: false, result: 'job_not_found', message: 'Job não encontrado após execução', invoice_id: null };
  }
  if (snap.status === 'completed') {
    return {
      success: true,
      result: snap.completion_outcome ?? 'completed',
      message: 'Renovação concluída com sucesso.',
      invoice_id: snap.result_invoice_id,
    };
  }
  if (snap.status === 'failed') {
    return {
      success: false,
      result: snap.completion_outcome ?? 'failed',
      message: snap.error_message?.slice(0, 500) ?? 'Processamento falhou.',
      invoice_id: snap.result_invoice_id,
    };
  }
  if (batch.cancelled > 0) {
    return {
      success: false,
      result: 'cancelled',
      message: 'Job cancelado pelo motor (assinatura ou ciclo inelegível).',
      invoice_id: null,
    };
  }
  return {
    success: false,
    result: snap.status,
    message: 'Processamento não concluiu — verifique o status do job.',
    invoice_id: snap.result_invoice_id,
  };
}

async function probeNotificationSent(invoiceId: string | null): Promise<boolean> {
  if (!invoiceId) return false;
  try {
    const r = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM platform_notification_deliveries
         WHERE entity_type = 'customer_invoice' AND entity_id = $1::text
           AND status IN ('sent', 'delivered', 'queued')
       ) AS ok`,
      [invoiceId]
    );
    return !!(r.rows[0] as { ok?: boolean } | undefined)?.ok;
  } catch {
    return false;
  }
}

async function loadSubscriptionStatus(subscriptionId: string): Promise<string | null> {
  const r = await pool.query(`SELECT status::text FROM subscriptions WHERE id = $1 LIMIT 1`, [subscriptionId]);
  return (r.rows[0] as { status?: string } | undefined)?.status ?? null;
}

async function runSynchronousManualPipeline(params: {
  tenantId: string;
  subscriptionId: string;
  jobId: string;
  actor: ActorContext;
  correlationId: string;
  action: 'generate_now' | 'reprocess';
  startedAt: number;
}): Promise<ManualBillingExecutionResult> {
  const logs: string[] = [];
  const workerId = buildWorkerId(params.actor);
  const startedIso = new Date(params.startedAt).toISOString();

  patchBillingJobTraceContext({
    job_id: params.jobId,
    worker_id: workerId,
    subscription_id: params.subscriptionId,
  });
  traceBillingJobPhase(
    'run_synchronous_manual_pipeline_start',
    {
      job_id: params.jobId,
      worker_id: workerId,
      action: params.action,
      correlation_id: params.correlationId,
    },
    { file: 'billingManualRenewalService.ts', line: 386, function: 'runSynchronousManualPipeline' }
  );

  logManualRenewal({
    action: params.action,
    subscription_id: params.subscriptionId,
    tenant_id: params.tenantId,
    job_id: params.jobId,
    started_at: startedIso,
    actor_user: params.actor.user_id,
    correlation_id: params.correlationId,
  });
  logs.push('manual_pipeline_started');

  traceRenewalPipelineStage('JOB_PICKUP', { job_id: params.jobId, worker_id: workerId });
  const pickupStarted = Date.now();

  const exec = await executeRenewalJobSynchronously(params.jobId, workerId, { manualExecution: true });
  traceRenewalPipelineStageEnd('JOB_PICKUP', pickupStarted, {
    processed: exec.processed,
    failed: exec.failed,
    cancelled: exec.cancelled,
    job_status: exec.job_status,
  }, exec.processed > 0 || exec.job_status === 'completed');
  logs.push(`worker_batch processed=${exec.processed} failed=${exec.failed} cancelled=${exec.cancelled}`);

  if (exec.processed === 0 && exec.failed === 0 && exec.cancelled === 0) {
    traceEngineNotReached('manual_pipeline_batch_empty', {
      job_id: params.jobId,
      job_status_after: exec.job_status,
      caller: {
        file: 'billingManualRenewalService.ts',
        line: 410,
        function: 'runSynchronousManualPipeline',
      },
    });
  }

  const notifyFlush = await flushBillingNotificationSideEffects();
  traceRenewalPipelineStage('NOTIFICATIONS', { drained: notifyFlush.drained });
  logs.push(`notification_flush drained=${notifyFlush.drained}`);

  let notification_sent = notifyFlush.drained > 0;
  if (!notification_sent && exec.invoice_id) {
    notification_sent = await probeNotificationSent(exec.invoice_id);
  }

  const subscription_status = await loadSubscriptionStatus(params.subscriptionId);
  const finishedAt = Date.now();
  const duration_ms = finishedAt - params.startedAt;

  let success = false;
  let result = exec.completion_outcome ?? exec.job_status ?? 'unknown';
  let message = '';

  if (exec.job_status === 'completed') {
    success = true;
    result = exec.completion_outcome ?? 'completed';
    message = exec.invoice_id
      ? 'Renovação concluída — fatura criada ou reutilizada.'
      : 'Ciclo processado sem nova fatura (itens não elegíveis).';
  } else if (exec.job_status === 'failed') {
    success = false;
    message = exec.error_message?.slice(0, 500) ?? 'Processamento falhou.';
    result = exec.completion_outcome ?? 'failed';
  } else if (exec.cancelled > 0) {
    success = false;
    message = 'Job cancelado pelo motor (assinatura ou ciclo inelegível).';
    result = 'cancelled';
  } else if (exec.processed === 0 && exec.failed === 0) {
    success = false;
    message =
      'O job não foi executado — pode estar bloqueado, em processamento por outro worker, ou inelegível.';
    result = 'job_not_executed';
  } else {
    success = exec.processed > 0 && exec.failed === 0;
    message = success ? 'Processamento concluído.' : 'Processamento não concluiu com sucesso.';
  }

  logManualRenewal({
    action: params.action,
    subscription_id: params.subscriptionId,
    job_id: params.jobId,
    cycle_key: exec.cycle_key,
    started_at: startedIso,
    finished_at: new Date(finishedAt).toISOString(),
    duration_ms,
    invoice_id: exec.invoice_id,
    gateway_status: exec.gateway_status,
    notification_sent,
    result,
    success,
    correlation_id: params.correlationId,
  });

  traceBillingJobPhase(
    'run_synchronous_manual_pipeline_end',
    {
      job_id: params.jobId,
      success,
      result,
      processed: exec.processed,
      failed: exec.failed,
      cancelled: exec.cancelled,
      invoice_id: exec.invoice_id,
      job_status: exec.job_status,
      duration_ms,
    },
    { file: 'billingManualRenewalService.ts', line: 469, function: 'runSynchronousManualPipeline' }
  );

  const structured = success ? null : structuredErrorFromResult(result);
  if (success) {
    traceRenewalPipelineStage('COMPLETE', { invoice_id: exec.invoice_id, result });
  } else {
    traceRenewalPipelineError('JOB_PICKUP', new Error(message), { result, job_status: exec.job_status });
  }

  return {
    success,
    job_id: params.jobId,
    invoice_id: exec.invoice_id,
    invoice_number: exec.invoice_number,
    gateway_status: exec.gateway_status,
    notification_sent,
    subscription_status,
    cycle_key: exec.cycle_key,
    execution_mode: 'manual',
    duration_ms,
    message,
    result,
    error_code: structured?.error_code ?? null,
    stage: structured?.stage ?? (success ? 'COMPLETE' : 'ERROR'),
    reason: structured?.reason ?? result,
    repaired_fields: [],
    logs,
    correlation_id: params.correlationId,
  };
}

function structuredErrorFromResult(result: string): {
  error_code: string;
  stage: string;
  reason: string;
} {
  const map: Record<string, { error_code: string; stage: string }> = {
    not_ready: { error_code: 'READINESS_BLOCKED', stage: 'READINESS' },
    job_processing: { error_code: 'JOB_STILL_PROCESSING', stage: 'JOB_RESOLUTION' },
    job_not_executed: { error_code: 'JOB_NOT_PICKED', stage: 'JOB_PICKUP' },
    enqueue_failed: { error_code: 'JOB_RESOLUTION_FAILED', stage: 'JOB_RESOLUTION' },
    cancelled: { error_code: 'JOB_CANCELLED', stage: 'JOB_PICKUP' },
    failed: { error_code: 'ENGINE_FAILED', stage: 'ENGINE_START' },
    failed_max_attempts: { error_code: 'ENGINE_FAILED', stage: 'ENGINE_START' },
  };
  const m = map[result] ?? { error_code: result.toUpperCase().replace(/\W/g, '_'), stage: 'ERROR' };
  return { error_code: m.error_code, stage: m.stage, reason: result };
}

function attachStructuredError(
  partial: Partial<ManualBillingExecutionResult> & { message: string; result: string; duration_ms: number }
): ManualBillingExecutionResult {
  const structured = structuredErrorFromResult(partial.result);
  return emptyManualResult({
    ...partial,
    error_code: partial.error_code ?? structured.error_code,
    stage: partial.stage ?? structured.stage,
    reason: partial.reason ?? structured.reason,
  });
}

function emptyManualResult(
  partial: Partial<ManualBillingExecutionResult> & { message: string; result: string; duration_ms: number }
): ManualBillingExecutionResult {
  return {
    success: false,
    job_id: null,
    invoice_id: null,
    invoice_number: null,
    gateway_status: null,
    notification_sent: false,
    subscription_status: null,
    cycle_key: null,
    execution_mode: 'manual',
    repaired_fields: [],
    logs: [],
    ...partial,
  };
}

/** B0.2.1 — Gerar próxima cobrança (execução síncrona, sem scheduler). */
export async function manualRenewSubscription(
  tenantId: string,
  subscriptionId: string,
  actor: ActorContext
): Promise<ManualBillingExecutionResult> {
  return manualGenerateRenewalNow(tenantId, subscriptionId, actor);
}

/** B0.2.1 — Reprocessar ciclo pendente (execução síncrona). */
export async function manualReprocessSubscription(
  tenantId: string,
  subscriptionId: string,
  actor: ActorContext,
  jobId?: string
): Promise<ManualBillingExecutionResult> {
  return manualReprocessRenewal(tenantId, subscriptionId, actor, jobId);
}

export async function manualGenerateRenewalNow(
  tenantId: string,
  subscriptionId: string,
  actor: ActorContext
): Promise<ManualRenewalActionResult> {
  const started = Date.now();
  const correlationId = `manual-gen-${subscriptionId}-${Date.now()}`;

  return runWithBillingJobTraceContext(
    {
      correlation_id: correlationId,
      worker_id: null,
      subscription_id: subscriptionId,
      job_id: null,
      execution_mode: 'manual',
    },
    () =>
      runWithRenewalPipeline(
        {
          correlation_id: correlationId,
          subscription_id: subscriptionId,
          job_id: null,
          invoice_id: null,
          cycle_key: null,
          execution_mode: 'manual',
          started_at_ms: started,
        },
        async () => {
      traceRenewalPipelineStage('HTTP_RECEIVED', {
        tenant_id: tenantId,
        actor_user: actor.user_id,
        action: 'generate_now',
      });
      traceBillingJobPhase(
        'manual_generate_renewal_now_start',
        { tenant_id: tenantId, subscription_id: subscriptionId, actor_user: actor.user_id },
        { file: 'billingManualRenewalService.ts', line: 673, function: 'manualGenerateRenewalNow' }
      );

      const readinessStarted = Date.now();
      const diagnosis = await diagnoseRenewalForTenant(tenantId, subscriptionId);
      const readiness = assessManualGenerateUnblocked(diagnosis);
      traceRenewalPipelineStageEnd(
        'READINESS',
        readinessStarted,
        { ready: readiness.ready, blockers: readiness.blockers },
        readiness.ready
      );
      if (!readiness.ready) {
        const message = `Assinatura não apta: ${readiness.blockers.join('; ')}`;
        logBillingManual('generate_now', {
          subscription_id: subscriptionId,
          tenant_id: tenantId,
          success: false,
          actor_user: actor.user_id,
          correlation_id: correlationId,
          blockers: readiness.blockers.join(','),
        });
        return attachStructuredError({
          success: false,
          message,
          result: 'not_ready',
          duration_ms: Date.now() - started,
          diagnosis,
          correlation_id: correlationId,
        });
      }

      const jobResStarted = Date.now();
      let jobId: string;
      try {
        const ensured = await ensureJobForManualGenerate(subscriptionId, tenantId);
        jobId = ensured.job_id;
        patchBillingJobTraceContext({ job_id: jobId });
        patchRenewalPipelineContext({ job_id: jobId, cycle_key: diagnosis.dates.job_cycle_key });
        traceRenewalPipelineStageEnd('JOB_RESOLUTION', jobResStarted, { job_id: jobId, mode: ensured.mode }, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        traceRenewalPipelineError('JOB_RESOLUTION', e, { subscription_id: subscriptionId });
        logBillingManual('generate_now', {
          subscription_id: subscriptionId,
          tenant_id: tenantId,
          success: false,
          actor_user: actor.user_id,
          correlation_id: correlationId,
          error: msg,
        });
        return attachStructuredError({
          message: msg,
          result: 'enqueue_failed',
          duration_ms: Date.now() - started,
          diagnosis,
          correlation_id: correlationId,
        });
      }

      const pipeline = await runSynchronousManualPipeline({
        tenantId,
        subscriptionId,
        jobId,
        actor,
        correlationId,
        action: 'generate_now',
        startedAt: started,
      });
      pipeline.diagnosis = diagnosis;

      logBillingManual('generate_now', {
        subscription_id: subscriptionId,
        tenant_id: tenantId,
        job_id: jobId,
        invoice_id: pipeline.invoice_id,
        success: pipeline.success,
        actor_user: actor.user_id,
        duration_ms: pipeline.duration_ms,
        correlation_id: correlationId,
        result: pipeline.result,
      });

      await insertManualRenewalAudit({
        action: 'MANUAL_GENERATE',
        subscriptionId,
        tenantId,
        jobId,
        invoiceId: pipeline.invoice_id,
        actor,
        success: pipeline.success,
        message: pipeline.message,
        durationMs: pipeline.duration_ms,
        correlationId,
      });

      traceBillingJobPhase(
        'manual_generate_renewal_now_end',
        {
          job_id: jobId,
          success: pipeline.success,
          result: pipeline.result,
          invoice_id: pipeline.invoice_id,
          duration_ms: pipeline.duration_ms,
        },
        { file: 'billingManualRenewalService.ts', line: 708, function: 'manualGenerateRenewalNow' }
      );

      return pipeline;
        }
      )
  );
}

export async function manualReprocessRenewal(
  tenantId: string,
  subscriptionId: string,
  actor: ActorContext,
  jobId?: string
): Promise<ManualRenewalActionResult> {
  const started = Date.now();
  const correlationId = `manual-reproc-${subscriptionId}-${Date.now()}`;
  const diagnosis = await diagnoseRenewalForTenant(tenantId, subscriptionId);

  if (diagnosis.validation.status !== 'active') {
    return attachStructuredError({
      job_id: jobId ?? null,
      message: 'Assinatura não está ativa.',
      result: 'subscription_not_active',
      duration_ms: Date.now() - started,
      diagnosis,
      correlation_id: correlationId,
    });
  }

  const cycleKey =
    normalizeBillingCycleKeyYmd(diagnosis.dates.next_billing_date ?? '') ||
    diagnosis.dates.job_cycle_key ||
    '';
  let targetJobId = jobId;
  if (!targetJobId) {
    const reprocessable = cycleKey ? await findReprocessableJob(subscriptionId, tenantId, cycleKey) : null;
    targetJobId = reprocessable?.id;
  }

  if (!targetJobId) {
    return attachStructuredError({
      message: 'Não há ciclo pendente ou com falha para reprocessar.',
      result: 'no_reprocessable_job',
      duration_ms: Date.now() - started,
      diagnosis,
      correlation_id: correlationId,
    });
  }

  const jobCheck = await pool.query(
    `SELECT id::text, subscription_id::text, tenant_id::text, status
     FROM billing_recurring_jobs WHERE id = $1::uuid LIMIT 1`,
    [targetJobId]
  );
  const jobRow = jobCheck.rows[0] as Record<string, unknown> | undefined;
  if (!jobRow || String(jobRow.subscription_id) !== subscriptionId || String(jobRow.tenant_id) !== tenantId) {
    return attachStructuredError({
      message: 'Job não encontrado para esta assinatura.',
      result: 'job_not_found',
      duration_ms: Date.now() - started,
      diagnosis,
      correlation_id: correlationId,
    });
  }

  const status = String(jobRow.status ?? '');
  if (status !== 'pending' && status !== 'failed' && status !== 'processing') {
    return attachStructuredError({
      job_id: targetJobId,
      message: `Status do job (${status}) não permite reprocessamento.`,
      result: 'job_not_reprocessable',
      duration_ms: Date.now() - started,
      diagnosis,
      correlation_id: correlationId,
    });
  }

  const processing = await findProcessingJobId(subscriptionId, tenantId);
  if (processing && processing !== targetJobId) {
    return attachStructuredError({
      job_id: processing,
      message: 'Outro job está em processamento para esta assinatura.',
      result: 'job_processing',
      duration_ms: Date.now() - started,
      diagnosis,
      correlation_id: correlationId,
    });
  }

  await prepareJobForImmediateRun(targetJobId);

  const pipeline = await runSynchronousManualPipeline({
    tenantId,
    subscriptionId,
    jobId: targetJobId,
    actor,
    correlationId,
    action: 'reprocess',
    startedAt: started,
  });
  pipeline.diagnosis = diagnosis;

  logBillingManual('reprocess', {
    subscription_id: subscriptionId,
    tenant_id: tenantId,
    job_id: targetJobId,
    invoice_id: pipeline.invoice_id,
    success: pipeline.success,
    actor_user: actor.user_id,
    duration_ms: pipeline.duration_ms,
    correlation_id: correlationId,
    result: pipeline.result,
  });

  await insertManualRenewalAudit({
    action: 'MANUAL_REPROCESS',
    subscriptionId,
    tenantId,
    jobId: targetJobId,
    invoiceId: pipeline.invoice_id,
    actor,
    success: pipeline.success,
    message: pipeline.message,
    durationMs: pipeline.duration_ms,
    correlationId,
  });

  return pipeline;
}
