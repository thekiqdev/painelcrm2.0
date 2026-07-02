/**
 * Billing Engine V2 — Sprint 3.1A: grava observações do Worker V2 (sem alterar lógica).
 */
import type { BillingExecutionStageResult } from '../billingExecution/types.js';
import type { BillingRenewalResult } from '../services/billingRenewalEngine/types.js';
import { RenewalHardeningError } from '../services/renewalErrorClassification.js';
import { BillingExecutionOrchestratorError } from '../billingExecution/types.js';
import { recordRenewalObservation } from './billingMetricsCollector.js';
import type { ActivePerformanceProfile } from './billingPerformanceProfiler.js';

function phaseOk(status: string): boolean {
  return status === 'ok' || status === 'queued' || status === 'sent' || status === 'skipped';
}

export function recordWorkerRenewalSuccess(params: {
  renewal: BillingRenewalResult;
  stage: BillingExecutionStageResult;
  durationMs: number;
  jobAttempts: number;
  profiler: ActivePerformanceProfile;
}): void {
  params.profiler.complete('success');
  recordRenewalObservation({
    success: true,
    duration_ms: params.durationMs,
    idempotent: params.stage.persisted.idempotentReuse,
    job_attempts: params.jobAttempts,
    gateway_ok: !params.stage.gateway.failed,
    notification_ok: phaseOk(params.stage.notification.status),
    timeline_ok: phaseOk(params.stage.timeline.status),
    history_ok: phaseOk(params.stage.history.status),
    subscription_advanced: params.stage.subscription.advanced,
  });
}

export function recordWorkerRenewalFailure(params: {
  err: unknown;
  durationMs: number;
  jobAttempts: number;
  profiler: ActivePerformanceProfile;
}): void {
  params.profiler.complete('failed');

  let error_code: string | undefined;
  let error_stage: string | undefined;

  if (params.err instanceof RenewalHardeningError) {
    error_code = params.err.classification.reason_code;
    error_stage = 'CONTEXT';
  } else if (params.err instanceof BillingExecutionOrchestratorError) {
    error_code = params.err.code;
    error_stage = params.err.stage ?? 'PERSISTENCE';
  } else if (params.err instanceof Error) {
    error_code = params.err.name;
    error_stage = 'PIPELINE';
  }

  recordRenewalObservation({
    success: false,
    duration_ms: params.durationMs,
    idempotent: false,
    job_attempts: params.jobAttempts,
    gateway_ok: false,
    notification_ok: false,
    timeline_ok: false,
    history_ok: false,
    subscription_advanced: false,
    error_code,
    error_stage,
  });
}
