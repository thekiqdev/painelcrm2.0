/**
 * BillingRenewalEngine — ponto único de entrada para renovação financeira (B0.3).
 */
import { billingLog } from '../billingLogger.js';
import { traceEngineFinish, traceEngineStart } from '../billingJobLifecycleTrace.js';
import type { SubscriptionRow } from '../billingSubscriptionService.js';
import { RenewalHardeningError } from '../renewalErrorClassification.js';
import { executeSaasRenewal } from './executeSaasRenewal.js';
import type {
  BillingRenewalExecuteInput,
  BillingRenewalExecutionContext,
  BillingRenewalExecutionMode,
  BillingRenewalResult,
} from './types.js';

function mapExecutionModeToCorrelationPrefix(mode: BillingRenewalExecutionMode): string {
  switch (mode) {
    case 'manual':
      return 'manual-renewal';
    case 'scheduler':
      return 'scheduler-renewal';
    case 'recovery':
      return 'recovery-renewal';
    case 'api':
      return 'api-renewal';
    case 'automatic':
    default:
      return 'crm-renewal';
  }
}

function buildExecutionContext(input: BillingRenewalExecuteInput): BillingRenewalExecutionContext {
  const correlationId =
    input.correlationId ??
    `${mapExecutionModeToCorrelationPrefix(input.executionMode)}-${input.jobId}-${input.subscriptionId}`;
  return {
    subscription: input.subscription,
    tenantId: input.subscription.tenant_id,
    customerId: input.subscription.customer_id,
    cycle: {
      cycleKey: input.cycleKey,
      periodStartYmd: input.periodStartYmd,
    },
    executionMode: input.executionMode,
    correlationId,
    workerId: input.workerId,
    job: {
      id: input.jobId,
      subscription_id: input.subscriptionId,
      tenant_id: input.subscription.tenant_id,
      job_type: input.options?.job_type as string ?? 'renewal',
      cycle_key: input.cycleKey,
      scheduled_at: input.options?.scheduled_at as string ?? new Date().toISOString(),
      retry_at: (input.options?.retry_at as string | null) ?? null,
      status: (input.options?.status as string) ?? 'processing',
      attempts: Number(input.options?.attempts ?? 0),
      max_attempts: Number(input.options?.max_attempts ?? 3),
    },
    repairInfo: { repairs: [] },
  };
}

export class BillingRenewalEngine {
  /**
   * Executa o pipeline completo de renovação para um ciclo.
   * Retry, locks, scheduler e janela horária ficam fora do engine.
   */
  static async execute(input: BillingRenewalExecuteInput): Promise<BillingRenewalResult> {
    const started = Date.now();
    const ctx = buildExecutionContext(input);
    const logs = [`engine_start mode=${input.executionMode}`];

    traceEngineStart({
      execution_mode: input.executionMode,
      subscription_id: input.subscriptionId,
      job_id: input.jobId,
      cycle_key: input.cycleKey,
      worker_id: input.workerId,
      correlation_id: ctx.correlationId,
      caller_file: 'billingRenewalEngine.ts',
      caller_line: 67,
      caller_function: 'BillingRenewalEngine.execute',
    });

    billingLog('job', 'billing_renewal_engine_execute', {
      execution_mode: input.executionMode,
      subscription_id: input.subscriptionId,
      job_id: input.jobId,
      cycle_key: input.cycleKey,
      worker_id: input.workerId,
      correlation_id: ctx.correlationId,
    });

    const subscription = input.subscription;
    let result: BillingRenewalResult;

    if (subscription.type === 'customer') {
      throw new RenewalHardeningError({
        category: 'PROGRAMMING_ERROR',
        permanent: true,
        message:
          'BillingRenewalEngine: renovações CRM devem usar Worker V2 (BillingExecutionContext + BillingExecutionOrchestrator)',
        reason_code: 'crm_use_worker_v2_pipeline',
        should_retry: false,
        critical_log: true,
      });
    } else if (subscription.type === 'saas') {
      result = await executeSaasRenewal({
        client: input.client,
        job: ctx.job,
        subscription,
        periodStartYmd: input.periodStartYmd,
        executionMode: input.executionMode,
        correlationId: ctx.correlationId,
      });
    } else {
      throw new Error(`BillingRenewalEngine: tipo de assinatura não suportado: ${subscription.type}`);
    }

    logs.push(...result.logs);
    billingLog('job', 'billing_renewal_engine_complete', {
      execution_mode: input.executionMode,
      subscription_id: input.subscriptionId,
      job_id: input.jobId,
      success: result.success,
      invoice_id: result.invoiceId ?? undefined,
      completion_outcome: result.completionOutcome ?? undefined,
      duration_ms: Date.now() - started,
    });

    traceEngineFinish({
      execution_mode: input.executionMode,
      subscription_id: input.subscriptionId,
      job_id: input.jobId,
      success: result.success,
      invoice_id: result.invoiceId ?? undefined,
      completion_outcome: result.completionOutcome ?? undefined,
      duration_ms: Date.now() - started,
      correlation_id: ctx.correlationId,
      caller_file: 'billingRenewalEngine.ts',
      caller_line: 120,
      caller_function: 'BillingRenewalEngine.execute',
    });

    return {
      ...result,
      logs,
      executionTime: result.executionTime || Date.now() - started,
    };
  }
}

export type { BillingRenewalExecuteInput, BillingRenewalExecutionContext, BillingRenewalResult, BillingRenewalExecutionMode };
