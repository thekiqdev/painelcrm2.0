import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordRenewalObservation,
  getMetricsCollectorSnapshot,
  resetMetricsCollectorForTests,
} from './billingMetricsCollector.js';
import { buildBillingHealthDashboard } from './billingHealthDashboard.js';
import {
  beginPerformanceProfile,
  getAverageStageDurations,
  getRecentPerformanceProfiles,
  resetPerformanceProfilerForTests,
} from './billingPerformanceProfiler.js';
import { getBillingObservabilityReport } from './billingObservabilityService.js';
import { runBillingOperationalAudit } from './billingOperationalAudit.js';
import { recordWorkerRenewalFailure, recordWorkerRenewalSuccess } from './workerObservationRecorder.js';
import { RenewalHardeningError } from '../services/renewalErrorClassification.js';
import { BILLING_RECURRING_JOB_OUTCOME } from '../services/billingRecurringJobPersistence.js';

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
  },
}));

function successObservation(overrides: Record<string, unknown> = {}) {
  recordRenewalObservation({
    success: true,
    duration_ms: 120,
    idempotent: false,
    job_attempts: 0,
    gateway_ok: true,
    notification_ok: true,
    timeline_ok: true,
    history_ok: true,
    subscription_advanced: true,
    ...overrides,
  });
}

describe('billingMetricsCollector', () => {
  beforeEach(() => resetMetricsCollectorForTests());

  it('agrega renewals_total e success', () => {
    successObservation();
    successObservation();
    recordRenewalObservation({
      success: false,
      duration_ms: 50,
      idempotent: false,
      job_attempts: 1,
      gateway_ok: false,
      notification_ok: false,
      timeline_ok: false,
      history_ok: false,
      subscription_advanced: false,
      error_code: 'BILLING_PLAN_NOT_FOUND',
      error_stage: 'CONTEXT',
    });
    const m = getMetricsCollectorSnapshot(0);
    expect(m.renewals_total).toBe(3);
    expect(m.renewals_success).toBe(2);
    expect(m.renewals_failed).toBe(1);
    expect(m.billing_plan_errors).toBe(1);
  });

  it('calcula gateway_success_rate', () => {
    successObservation({ gateway_ok: true });
    successObservation({ gateway_ok: false });
    const m = getMetricsCollectorSnapshot(0);
    expect(m.gateway_success_rate).toBe(50);
  });

  it('registra idempotency_hits', () => {
    successObservation({ idempotent: true });
    expect(getMetricsCollectorSnapshot(0).idempotency_hits).toBe(1);
  });

  it('calcula average e max execution time', () => {
    successObservation({ duration_ms: 100 });
    successObservation({ duration_ms: 300 });
    const m = getMetricsCollectorSnapshot(0);
    expect(m.average_execution_time).toBe(200);
    expect(m.max_execution_time).toBe(300);
  });

  it('job_retry_rate com attempts', () => {
    successObservation({ job_attempts: 2 });
    successObservation({ job_attempts: 0 });
    const m = getMetricsCollectorSnapshot(0);
    expect(m.job_retry_rate).toBe(50);
  });

  it('engine_errors em falha ENGINE', () => {
    recordRenewalObservation({
      success: false,
      duration_ms: 1,
      idempotent: false,
      job_attempts: 0,
      gateway_ok: false,
      notification_ok: false,
      timeline_ok: false,
      history_ok: false,
      subscription_advanced: false,
      error_code: 'ENGINE_NOT_APPROVED',
      error_stage: 'ENGINE',
    });
    expect(getMetricsCollectorSnapshot(0).engine_errors).toBe(1);
  });

  it('billing_items_errors', () => {
    recordRenewalObservation({
      success: false,
      duration_ms: 1,
      idempotent: false,
      job_attempts: 0,
      gateway_ok: false,
      notification_ok: false,
      timeline_ok: false,
      history_ok: false,
      subscription_advanced: false,
      error_code: 'BILLING_ITEMS_NOT_FOUND',
      error_stage: 'CONTEXT',
    });
    expect(getMetricsCollectorSnapshot(0).billing_items_errors).toBe(1);
  });
});

describe('billingHealthDashboard', () => {
  beforeEach(() => resetMetricsCollectorForTests());

  it('gera 10 cards obrigatórios', () => {
    successObservation();
    const cards = buildBillingHealthDashboard(getMetricsCollectorSnapshot(0));
    expect(cards).toHaveLength(10);
    expect(cards.map((c) => c.id)).toContain('success_rate');
    expect(cards.map((c) => c.id)).toContain('gateway_success');
  });

  it('success rate 100% quando todas ok', () => {
    successObservation();
    const card = buildBillingHealthDashboard(getMetricsCollectorSnapshot(0)).find(
      (c) => c.id === 'success_rate'
    );
    expect(card?.value).toBe(100);
    expect(card?.status).toBe('ok');
  });
});

describe('billingPerformanceProfiler', () => {
  beforeEach(() => resetPerformanceProfilerForTests());

  it('registra estágios e duração total', () => {
    const p = beginPerformanceProfile({
      correlation_id: 'c1',
      subscription_id: 's1',
      job_id: 'j1',
    });
    const s = Date.now();
    p.markStage('ExecutionContext', s);
    const profile = p.complete('success');
    expect(profile.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(profile.stages).toHaveLength(1);
  });

  it('average stage durations', () => {
    const p = beginPerformanceProfile({
      correlation_id: 'c1',
      subscription_id: 's1',
      job_id: 'j1',
    });
    p.markStage('ExecutionContext', Date.now());
    p.complete('success');
    expect(getAverageStageDurations()['ExecutionContext']).toBeDefined();
  });

  it('recent profiles limit', () => {
    for (let i = 0; i < 3; i++) {
      const p = beginPerformanceProfile({
        correlation_id: `c${i}`,
        subscription_id: 's1',
        job_id: 'j1',
      });
      p.complete('success');
    }
    expect(getRecentPerformanceProfiles(2)).toHaveLength(2);
  });
});

describe('billingObservabilityService', () => {
  beforeEach(() => {
    resetMetricsCollectorForTests();
    resetPerformanceProfilerForTests();
  });

  it('health summary com 8 checks', async () => {
    successObservation();
    const report = await getBillingObservabilityReport();
    expect(report.health.checks).toHaveLength(8);
    expect(report.version).toContain('v3');
  });

  it('dashboard no report', async () => {
    const report = await getBillingObservabilityReport();
    expect(report.dashboard.length).toBe(10);
  });

  it('includeAudit quando solicitado', async () => {
    const report = await getBillingObservabilityReport({ includeAudit: true });
    expect(report.audit).toBeDefined();
    expect(report.audit?.healthy).toBe(true);
  });
});

describe('billingOperationalAudit', () => {
  beforeEach(() => resetMetricsCollectorForTests());

  it('audit healthy sem falhas', async () => {
    successObservation();
    const audit = await runBillingOperationalAudit();
    expect(audit.healthy).toBe(true);
    expect(audit.recommendations.some((r) => r.includes('3.2'))).toBe(true);
  });

  it('audit detecta falhas', async () => {
    recordRenewalObservation({
      success: false,
      duration_ms: 1,
      idempotent: false,
      job_attempts: 0,
      gateway_ok: false,
      notification_ok: false,
      timeline_ok: false,
      history_ok: false,
      subscription_advanced: false,
      error_code: 'BILLING_PLAN_NOT_FOUND',
    });
    const audit = await runBillingOperationalAudit();
    expect(audit.issues.some((i) => i.code === 'billing_plan_errors')).toBe(true);
  });

  it('failure aggregation', async () => {
    for (let i = 0; i < 3; i++) {
      recordRenewalObservation({
        success: false,
        duration_ms: 1,
        idempotent: false,
        job_attempts: 0,
        gateway_ok: false,
        notification_ok: false,
        timeline_ok: false,
        history_ok: false,
        subscription_advanced: false,
      });
    }
    const audit = await runBillingOperationalAudit();
    expect(audit.issues.find((i) => i.code === 'renewal_failures')?.count).toBe(3);
  });
});

describe('workerObservationRecorder', () => {
  beforeEach(() => {
    resetMetricsCollectorForTests();
    resetPerformanceProfilerForTests();
  });

  const mockStage = () => ({
    engine: { approved: true },
    persisted: { idempotentReuse: false, itemCount: 1, invoice: {} },
    gateway: { status: 'PENDING', paymentId: 'p1', failed: false },
    notification: { status: 'queued' as const },
    timeline: { status: 'ok' as const, eventsRecorded: 1 },
    history: { status: 'ok' as const },
    subscription: { advanced: true },
    renewal: {
      success: true,
      invoiceId: 'inv-1',
      gatewayStatus: 'PENDING',
      notificationStatus: 'queued',
      timelineStatus: 'ok',
      historyStatus: 'ok',
      subscriptionAdvanced: true,
      completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
      executionTime: 10,
      logs: [],
      cycleKey: '2026-06-01',
      executionMode: 'automatic' as const,
      correlationId: 'c1',
    },
  });

  it('recordWorkerRenewalSuccess incrementa métricas', () => {
    const profiler = beginPerformanceProfile({
      correlation_id: 'c1',
      subscription_id: 's1',
      job_id: 'j1',
    });
    recordWorkerRenewalSuccess({
      renewal: mockStage().renewal,
      stage: mockStage() as never,
      durationMs: 100,
      jobAttempts: 0,
      profiler,
    });
    expect(getMetricsCollectorSnapshot(0).renewals_success).toBe(1);
  });

  it('recordWorkerRenewalFailure em RenewalHardeningError', () => {
    const profiler = beginPerformanceProfile({
      correlation_id: 'c1',
      subscription_id: 's1',
      job_id: 'j1',
    });
    recordWorkerRenewalFailure({
      err: new RenewalHardeningError({
        category: 'CONFIGURATION_ERROR',
        permanent: true,
        message: 'plan',
        reason_code: 'BILLING_PLAN_NOT_FOUND',
        should_retry: false,
        critical_log: false,
      }),
      durationMs: 50,
      jobAttempts: 0,
      profiler,
    });
    const m = getMetricsCollectorSnapshot(0);
    expect(m.renewals_failed).toBe(1);
    expect(m.billing_plan_errors).toBe(1);
  });
});

describe('gateway metrics degradation', () => {
  beforeEach(() => resetMetricsCollectorForTests());

  it('gateway abaixo de 85% gera issue na auditoria', async () => {
    successObservation({ gateway_ok: true });
    successObservation({ gateway_ok: false });
    successObservation({ gateway_ok: false });
    const audit = await runBillingOperationalAudit();
    expect(audit.issues.some((i) => i.code === 'gateway_degraded')).toBe(true);
  });
});
