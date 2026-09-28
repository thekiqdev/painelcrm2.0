/**
 * Billing Engine 3.0 — pipeline CRM do Worker (Context → Engine → Execution).
 */
import { billingExecutionContextBuilder } from '../../billingExecutionContext/billingExecutionContextBuilder.js';
import { BillingExecutionContextError } from '../../billingExecutionContext/errors.js';
import type { BillingExecutionContext } from '../../billingExecutionContext/types.js';
import { BillingExecutionOrchestrator } from '../../billingExecution/billingExecutionOrchestrator.js';
import { BillingExecutionOrchestratorError } from '../../billingExecution/types.js';
import type { SubscriptionRow } from '../billingSubscriptionService.js';
import { getSubscriptionById } from '../billingSubscriptionService.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  completeBillingRecurringJob,
} from '../billingRecurringJobPersistence.js';
import type {
  BillingRenewalExecutionMode,
  BillingRenewalJobRef,
  BillingRenewalResult,
} from '../billingRenewalEngine/types.js';
import { billingLog } from '../billingLogger.js';
import { logRenewalAttemptTrace } from '../renewalAttemptTrace.js';
import { RenewalHardeningError } from '../renewalErrorClassification.js';
import { logWorker } from './workerLogger.js';
import { beginPerformanceProfile } from '../../billingObservability/billingPerformanceProfiler.js';
import {
  recordWorkerRenewalFailure,
  recordWorkerRenewalSuccess,
} from '../../billingObservability/workerObservationRecorder.js';
import { billingPlanProvisionService } from '../../billingPlatform/provisioning/billingPlanProvisionService.js';
import { BillingPlanProvisionError } from '../../billingPlatform/provisioning/types.js';

export const WORKER_CRM_PIPELINE_VERSION = 'v3_worker_crm_ga';

type DbQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export type WorkerCrmRenewalInput = {
  client: DbQueryable;
  job: BillingRenewalJobRef;
  subscription: SubscriptionRow;
  periodStartYmd: string;
  cycleKey: string;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
  workerId: string;
};

function mapContextError(err: BillingExecutionContextError): RenewalHardeningError {
  const permanent =
    err.code === 'BILLING_PLAN_NOT_FOUND' ||
    err.code === 'BILLING_ITEMS_NOT_FOUND' ||
    err.code === 'NO_ELIGIBLE_ITEMS' ||
    err.code === 'LEGACY_PLAN_STRATEGY' ||
    err.code === 'LEGACY_ITEM_DETECTED' ||
    err.code === 'CONTEXT_NOT_PURE';

  return new RenewalHardeningError({
    category: permanent ? 'CONFIGURATION_ERROR' : 'DATA_INCONSISTENCY',
    permanent,
    message: err.message,
    reason_code: err.code,
    should_retry: !permanent,
    critical_log: false,
  });
}

export function assertWorkerContextReady(context: BillingExecutionContext): void {
  if (!context.metadata.context_certified) {
    throw new RenewalHardeningError({
      category: 'CONFIGURATION_ERROR',
      permanent: true,
      message: 'BillingExecutionContext não certificado (context_certified=false)',
      reason_code: 'CONTEXT_NOT_CERTIFIED',
      should_retry: false,
      critical_log: false,
    });
  }
  if (!context.diagnostics.context_pure) {
    throw new RenewalHardeningError({
      category: 'CONFIGURATION_ERROR',
      permanent: true,
      message: 'BillingExecutionContext não puro (context_pure=false)',
      reason_code: 'CONTEXT_NOT_PURE',
      should_retry: false,
      critical_log: false,
    });
  }
  if (!context.diagnostics.billing_plan_present || !context.metadata.has_persisted_plan) {
    throw new RenewalHardeningError({
      category: 'CONFIGURATION_ERROR',
      permanent: true,
      message: 'Billing Plan persistido obrigatório para renovação CRM V2',
      reason_code: 'BILLING_PLAN_NOT_FOUND',
      should_retry: false,
      critical_log: false,
    });
  }
  if (!context.diagnostics.billing_items_present || context.billingItems.length === 0) {
    throw new RenewalHardeningError({
      category: 'CONFIGURATION_ERROR',
      permanent: true,
      message: 'Billing Items persistidos obrigatórios para renovação CRM V2',
      reason_code: 'BILLING_ITEMS_NOT_FOUND',
      should_retry: false,
      critical_log: false,
    });
  }
}

export async function executeWorkerCrmRenewal(
  input: WorkerCrmRenewalInput
): Promise<BillingRenewalResult> {
  const started = Date.now();
  const { client, job, periodStartYmd, executionMode, correlationId, workerId } = input;
  let subscription = input.subscription;

  const profiler = beginPerformanceProfile({
    correlation_id: correlationId,
    subscription_id: subscription.id,
    job_id: job.id,
  });

  logWorker('WORKER', 'start', {
    subscription_id: subscription.id,
    job_id: job.id,
    cycle_key: input.cycleKey,
    execution_mode: executionMode,
    pipeline_version: WORKER_CRM_PIPELINE_VERSION,
  });

  try {
    try {
      const { applyPendingCrmSubscriptionContractIfDue } = await import(
        '../crmSubscriptionsContractService.js'
      );
      await applyPendingCrmSubscriptionContractIfDue(subscription.id);
    } catch (e) {
      billingLog('job', 'apply_pending_crm_contract_before_renewal_error', {
        subscription_id: subscription.id,
        job_id: job.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    const refreshed = await getSubscriptionById(subscription.id);
    if (refreshed) subscription = refreshed;

    logWorker('WORKER_CONTEXT', 'provision_start', {
      subscription_id: subscription.id,
      job_id: job.id,
    });

    try {
      const provision = await billingPlanProvisionService.ensureBillingPlan(subscription.id, {
        tenantId: subscription.tenant_id,
        periodStartYmd,
      });
      if (!provision.ok) {
        throw new BillingPlanProvisionError(
          provision.message || 'Falha ao provisionar Billing Plan',
          'PROVISION_FAILED',
          { subscription_id: subscription.id }
        );
      }
      logWorker('WORKER_CONTEXT', 'provision_complete', {
        subscription_id: subscription.id,
        billing_plan_id: provision.billing_plan_id,
        action: provision.action,
      });
    } catch (err) {
      if (err instanceof BillingPlanProvisionError) {
        throw new RenewalHardeningError({
          category: 'CONFIGURATION_ERROR',
          permanent:
            err.code === 'VALIDATION_FAILED' ||
            err.code === 'TENANT_MISMATCH' ||
            err.code === 'SUBSCRIPTION_NOT_FOUND',
          message: err.message,
          reason_code: `BILLING_PROVISION_${err.code}`,
          should_retry:
            err.code === 'PROVISION_FAILED' ||
            err.code === 'REPAIR_FAILED' ||
            err.code === 'SYNC_FAILED',
          critical_log: false,
        });
      }
      throw err;
    }

    logWorker('WORKER_CONTEXT', 'build_start', {
      subscription_id: subscription.id,
      job_id: job.id,
      cycle_key: input.cycleKey,
    });

    const contextStarted = Date.now();
    let context: BillingExecutionContext;
    try {
      context = await billingExecutionContextBuilder.build({
        subscriptionId: subscription.id,
        tenantId: subscription.tenant_id,
        cycleKey: input.cycleKey,
        periodStartYmd,
        correlationId,
        executionMode,
        skipCache: true,
      });
    } catch (err) {
      if (err instanceof BillingExecutionContextError) {
        throw mapContextError(err);
      }
      throw err;
    }

    profiler.markStage('ExecutionContext', contextStarted);
    assertWorkerContextReady(context);

    logWorker('WORKER_CONTEXT', 'build_complete', {
      subscription_id: subscription.id,
      context_certified: context.metadata.context_certified,
      context_pure: context.diagnostics.context_pure,
      item_count: context.billingItems.length,
      plan_source: context.metadata.plan_source,
    });

    logWorker('WORKER_EXECUTION', 'orchestrator_start', {
      subscription_id: subscription.id,
      job_id: job.id,
    });

    const orchestratorStarted = Date.now();
    let stage;
    try {
      stage = await BillingExecutionOrchestrator.execute({
        context,
        client,
        job,
        workerId,
        executionMode,
        periodStartYmd,
        correlationId,
      });
    } catch (err) {
      if (err instanceof BillingExecutionOrchestratorError) {
        throw new RenewalHardeningError({
          category: err.code === 'ENGINE_NOT_APPROVED' ? 'DATA_INCONSISTENCY' : 'PROGRAMMING_ERROR',
          permanent: err.code === 'ENGINE_NOT_APPROVED',
          message: err.message,
          reason_code: err.code,
          should_retry: err.code !== 'ENGINE_NOT_APPROVED',
          critical_log: false,
        });
      }
      throw err;
    }

    profiler.markStage('ExecutionOrchestrator', orchestratorStarted);
    if (stage.engine) {
      profiler.markStage('BillingEngine', orchestratorStarted);
    }

    logWorker('WORKER_ENGINE', 'complete', {
      subscription_id: subscription.id,
      approved: stage.engine?.approved ?? false,
      idempotent: stage.persisted.idempotentReuse,
    });

    logWorker('WORKER_EXECUTION', 'orchestrator_complete', {
      subscription_id: subscription.id,
      invoice_id: stage.renewal.invoiceId ?? undefined,
      gateway_status: stage.renewal.gatewayStatus ?? undefined,
    });

    const renewal = stage.renewal;
    const outcome =
      renewal.completionOutcome ??
      (renewal.success
        ? BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER
        : null);

    if (renewal.success && outcome) {
      await completeBillingRecurringJob(client, {
        jobId: job.id,
        resultInvoiceId: renewal.invoiceId,
        resultInvoiceType: renewal.invoiceId ? 'customer_invoice' : null,
        outcome,
        detail: JSON.stringify({
          pipeline: WORKER_CRM_PIPELINE_VERSION,
          invoice_number: renewal.invoiceNumber ?? null,
          period_start: periodStartYmd,
          gateway_status: renewal.gatewayStatus,
          idempotent_reuse: stage.persisted.idempotentReuse,
        }),
      });
    }

    logRenewalAttemptTrace({
      phase: 'worker_complete',
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      job_id: job.id,
      cycle_key: periodStartYmd,
      invoice_id: renewal.invoiceId ?? undefined,
      correlation_id: correlationId,
      result: outcome ?? undefined,
      final_status: renewal.success ? 'completed' : 'failed',
    });

    logWorker('WORKER_COMPLETE', 'done', {
      subscription_id: subscription.id,
      job_id: job.id,
      success: renewal.success,
      invoice_id: renewal.invoiceId ?? undefined,
      duration_ms: Date.now() - started,
      completion_outcome: outcome ?? undefined,
    });

    recordWorkerRenewalSuccess({
      renewal,
      stage,
      durationMs: Date.now() - started,
      jobAttempts: job.attempts,
      profiler,
    });

    return {
      ...renewal,
      executionTime: renewal.executionTime || Date.now() - started,
      logs: [...renewal.logs, 'worker_crm_v2_complete'],
    };
  } catch (err) {
    recordWorkerRenewalFailure({
      err,
      durationMs: Date.now() - started,
      jobAttempts: job.attempts,
      profiler,
    });
    throw err;
  }
}
