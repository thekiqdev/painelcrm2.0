/**
 * BILLING V2 Fase 1B — classificação estruturada de erros do motor de renovação.
 */
import type { RenewalPipelineStage } from './renewalPipelineTrace.js';

export type BillingRenewalErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export type BillingRenewalErrorClassification =
  | 'validation'
  | 'customer'
  | 'date'
  | 'template'
  | 'invoice'
  | 'gateway'
  | 'notification'
  | 'job'
  | 'concurrency'
  | 'configuration'
  | 'transport'
  | 'unknown';

export type BillingRenewalStructuredError = {
  error_code: string;
  reason: string;
  stage: RenewalPipelineStage | 'HTTP_RECEIVED';
  severity: BillingRenewalErrorSeverity;
  retryable: boolean;
  classification: BillingRenewalErrorClassification;
  correlation_id: string | null;
  subscription_id: string | null;
  invoice_id: string | null;
  job_id: string | null;
  execution_mode: string | null;
  cycle_key: string | null;
};

export function classifyBillingRenewalError(params: {
  error_code: string;
  reason: string;
  stage: RenewalPipelineStage | 'HTTP_RECEIVED';
  correlation_id?: string | null;
  subscription_id?: string | null;
  invoice_id?: string | null;
  job_id?: string | null;
  execution_mode?: string | null;
  cycle_key?: string | null;
  retryable?: boolean;
  classification?: BillingRenewalErrorClassification;
  severity?: BillingRenewalErrorSeverity;
}): BillingRenewalStructuredError {
  const classification =
    params.classification ??
    inferClassification(params.error_code, params.stage);
  const retryable =
    params.retryable ??
    !['validation', 'customer', 'date', 'template', 'configuration'].includes(classification);
  const severity =
    params.severity ??
    (classification === 'configuration' || classification === 'customer'
      ? 'critical'
      : retryable
        ? 'warning'
        : 'error');

  return {
    error_code: params.error_code,
    reason: params.reason,
    stage: params.stage,
    severity,
    retryable,
    classification,
    correlation_id: params.correlation_id ?? null,
    subscription_id: params.subscription_id ?? null,
    invoice_id: params.invoice_id ?? null,
    job_id: params.job_id ?? null,
    execution_mode: params.execution_mode ?? null,
    cycle_key: params.cycle_key ?? null,
  };
}

function inferClassification(
  errorCode: string,
  stage: RenewalPipelineStage | 'HTTP_RECEIVED'
): BillingRenewalErrorClassification {
  if (stage === 'CUSTOMER' || errorCode.includes('customer')) return 'customer';
  if (stage === 'DATES' || errorCode.includes('date')) return 'date';
  if (stage === 'PREVIOUS_INVOICE' || stage === 'ITEMS' || errorCode.includes('template')) {
    return 'template';
  }
  if (stage === 'CREATE_INVOICE' || stage === 'CREATE_ITEMS') return 'invoice';
  if (stage === 'GATEWAY' || errorCode.includes('gateway')) return 'gateway';
  if (stage === 'NOTIFICATIONS') return 'notification';
  if (stage === 'JOB_RESOLUTION' || stage === 'JOB_PICKUP') return 'job';
  if (errorCode.includes('concurrent') || errorCode.includes('duplicate')) return 'concurrency';
  if (stage === 'VALIDATION') return 'validation';
  return 'unknown';
}

export function logBillingRenewalError(err: BillingRenewalStructuredError, stack?: string): void {
  console.log(
    '[BILLING_RENEWAL_ERROR]',
    JSON.stringify({
      ...err,
      stack: stack?.slice(0, 3000) ?? undefined,
    })
  );
}
