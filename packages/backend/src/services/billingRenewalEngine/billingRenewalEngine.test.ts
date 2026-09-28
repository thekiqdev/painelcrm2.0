import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingRenewalEngine } from './billingRenewalEngine.js';
import * as executeSaasRenewal from './executeSaasRenewal.js';
import type { SubscriptionRow } from '../billingSubscriptionService.js';
import { RenewalHardeningError } from '../renewalErrorClassification.js';

function baseSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    status: 'active',
    customer_id: 'c1',
    billing_interval: 'monthly',
    next_billing_date: '2026-07-01',
    current_period_start: '2026-06-01',
    current_period_end: '2026-07-01',
    amount_cents: 1000,
    plan_id: null,
    users_count: null,
    contracted_plan_price_cents: null,
    contracted_price_per_user_cents: null,
    default_payment_method: null,
    cancel_at_period_end: false,
    billing_cycle_count: 1,
    ...overrides,
  } as SubscriptionRow;
}

const baseJob = {
  id: 'job-1',
  subscription_id: 'sub-1',
  tenant_id: 't1',
  job_type: 'renewal',
  cycle_key: '2026-07-01',
  scheduled_at: '2026-06-25T00:00:00.000Z',
  retry_at: null,
  status: 'processing',
  attempts: 0,
  max_attempts: 3,
};

describe('BillingRenewalEngine B0.3 — Sprint 3.1 cutover', () => {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bloqueia assinatura customer (Worker V2 pipeline)', async () => {
    const saasSpy = vi.spyOn(executeSaasRenewal, 'executeSaasRenewal');

    await expect(
      BillingRenewalEngine.execute({
        client,
        subscriptionId: 'sub-1',
        cycleKey: '2026-07-01',
        executionMode: 'automatic',
        jobId: 'job-1',
        workerId: 'worker-1',
        subscription: baseSubscription(),
        periodStartYmd: '2026-07-01',
        options: baseJob,
      })
    ).rejects.toBeInstanceOf(RenewalHardeningError);

    expect(saasSpy).not.toHaveBeenCalled();
  });

  it('roteia assinatura saas para executeSaasRenewal', async () => {
    const saasSpy = vi.spyOn(executeSaasRenewal, 'executeSaasRenewal').mockResolvedValue({
      success: true,
      invoiceId: 'tb-1',
      gatewayStatus: null,
      notificationStatus: 'queued',
      timelineStatus: 'ok',
      historyStatus: 'ok',
      subscriptionAdvanced: true,
      completionOutcome: 'completed_invoice_saas',
      executionTime: 5,
      logs: ['saas_renewal_complete'],
      cycleKey: '2026-07-01',
      executionMode: 'manual',
      correlationId: 'manual-test',
    });

    await BillingRenewalEngine.execute({
      client,
      subscriptionId: 'sub-1',
      cycleKey: '2026-07-01',
      executionMode: 'manual',
      jobId: 'job-1',
      workerId: 'manual:u1',
      subscription: baseSubscription({ type: 'saas', plan_id: 'plan-1' }),
      periodStartYmd: '2026-07-01',
    });

    expect(saasSpy).toHaveBeenCalledOnce();
  });
});
