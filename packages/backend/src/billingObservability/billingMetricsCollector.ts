/**
 * Billing Engine V2 — Sprint 3.1A: in-memory metrics collector (pipeline V2).
 */
import { logBillingObservability } from './observabilityLogger.js';
import type { BillingMetricsSnapshot, BillingRenewalObservation } from './types.js';
import { BILLING_OBSERVABILITY_VERSION } from './types.js';

type CollectorState = {
  renewals_total: number;
  renewals_success: number;
  renewals_failed: number;
  gateway_ok: number;
  gateway_total: number;
  notification_ok: number;
  notification_total: number;
  timeline_ok: number;
  timeline_total: number;
  history_ok: number;
  history_total: number;
  execution_times: number[];
  job_retries: number;
  job_total_with_attempts: number;
  idempotency_hits: number;
  engine_errors: number;
  context_errors: number;
  billing_plan_errors: number;
  billing_items_errors: number;
  last_renewal_at: string | null;
};

const state: CollectorState = {
  renewals_total: 0,
  renewals_success: 0,
  renewals_failed: 0,
  gateway_ok: 0,
  gateway_total: 0,
  notification_ok: 0,
  notification_total: 0,
  timeline_ok: 0,
  timeline_total: 0,
  history_ok: 0,
  history_total: 0,
  execution_times: [],
  job_retries: 0,
  job_total_with_attempts: 0,
  idempotency_hits: 0,
  engine_errors: 0,
  context_errors: 0,
  billing_plan_errors: 0,
  billing_items_errors: 0,
  last_renewal_at: null,
};

const MAX_EXECUTION_SAMPLES = 500;

function rate(ok: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((ok / total) * 100);
}

function classifyContextError(code: string | undefined): void {
  if (!code) return;
  state.context_errors += 1;
  if (code === 'BILLING_PLAN_NOT_FOUND' || code === 'LEGACY_PLAN_STRATEGY') {
    state.billing_plan_errors += 1;
  }
  if (code === 'BILLING_ITEMS_NOT_FOUND' || code === 'NO_ELIGIBLE_ITEMS' || code === 'LEGACY_ITEM_DETECTED') {
    state.billing_items_errors += 1;
  }
}

export function recordRenewalObservation(obs: BillingRenewalObservation): void {
  state.renewals_total += 1;
  state.last_renewal_at = new Date().toISOString();

  if (obs.job_attempts > 0) {
    state.job_total_with_attempts += 1;
    state.job_retries += 1;
  } else if (obs.success) {
    state.job_total_with_attempts += 1;
  }

  if (obs.idempotent) state.idempotency_hits += 1;

  if (obs.success) {
    state.renewals_success += 1;
    state.execution_times.push(obs.duration_ms);
    if (state.execution_times.length > MAX_EXECUTION_SAMPLES) {
      state.execution_times.shift();
    }

    state.gateway_total += 1;
    if (obs.gateway_ok) state.gateway_ok += 1;

    state.notification_total += 1;
    if (obs.notification_ok) state.notification_ok += 1;

    state.timeline_total += 1;
    if (obs.timeline_ok) state.timeline_ok += 1;

    state.history_total += 1;
    if (obs.history_ok) state.history_ok += 1;
  } else {
    state.renewals_failed += 1;
    if (obs.error_code === 'ENGINE_NOT_APPROVED' || obs.error_stage === 'ENGINE') {
      state.engine_errors += 1;
    }
    if (
      obs.error_stage === 'CONTEXT' ||
      obs.error_code?.startsWith('CONTEXT_') ||
      obs.error_code === 'BILLING_PLAN_NOT_FOUND' ||
      obs.error_code === 'BILLING_ITEMS_NOT_FOUND' ||
      obs.error_code === 'NO_ELIGIBLE_ITEMS'
    ) {
      classifyContextError(obs.error_code);
    }
  }

  logBillingObservability('BILLING_METRICS', obs.success ? 'renewal_success' : 'renewal_failed', {
    duration_ms: obs.duration_ms,
    idempotent: obs.idempotent,
    gateway_ok: obs.gateway_ok,
    error_code: obs.error_code,
  });
}

export function getMetricsCollectorSnapshot(orphanJobs: number | null = null): BillingMetricsSnapshot {
  const times = state.execution_times;
  const avg =
    times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const max = times.length > 0 ? Math.max(...times) : null;

  return {
    renewals_total: state.renewals_total,
    renewals_success: state.renewals_success,
    renewals_failed: state.renewals_failed,
    gateway_success_rate: rate(state.gateway_ok, state.gateway_total),
    notification_success_rate: rate(state.notification_ok, state.notification_total),
    timeline_success_rate: rate(state.timeline_ok, state.timeline_total),
    history_success_rate: rate(state.history_ok, state.history_total),
    average_execution_time: avg,
    max_execution_time: max,
    job_retry_rate: rate(state.job_retries, state.job_total_with_attempts),
    idempotency_hits: state.idempotency_hits,
    orphan_jobs: orphanJobs,
    engine_errors: state.engine_errors,
    context_errors: state.context_errors,
    billing_plan_errors: state.billing_plan_errors,
    billing_items_errors: state.billing_items_errors,
    last_renewal_at: state.last_renewal_at,
    pipeline_version: BILLING_OBSERVABILITY_VERSION,
  };
}

export function resetMetricsCollectorForTests(): void {
  state.renewals_total = 0;
  state.renewals_success = 0;
  state.renewals_failed = 0;
  state.gateway_ok = 0;
  state.gateway_total = 0;
  state.notification_ok = 0;
  state.notification_total = 0;
  state.timeline_ok = 0;
  state.timeline_total = 0;
  state.history_ok = 0;
  state.history_total = 0;
  state.execution_times = [];
  state.job_retries = 0;
  state.job_total_with_attempts = 0;
  state.idempotency_hits = 0;
  state.engine_errors = 0;
  state.context_errors = 0;
  state.billing_plan_errors = 0;
  state.billing_items_errors = 0;
  state.last_renewal_at = null;
}
