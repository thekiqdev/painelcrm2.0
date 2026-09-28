import { describe, it, expect } from 'vitest';
import { buildBillingPlanFromSubscription } from './billingPlanFactory.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';

function sampleSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    type: 'customer',
    tenant_id: 'tenant-1',
    customer_id: 'client-1',
    plan_id: null,
    amount_cents: 9900,
    currency: 'BRL',
    billing_anchor_day: 15,
    billing_cycle_count: 2,
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-07-15',
    current_period_start: '2026-06-15',
    current_period_end: '2026-07-15',
    grace_period_days: 3,
    default_payment_method: null,
    users_count: null,
    gateway: 'asaas',
    cancel_at_period_end: false,
    last_job_at: null,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    cycles_unlimited: true,
    max_cycles: null,
    ...overrides,
  };
}

describe('BillingPlanFactory', () => {
  it('monta plano draft v2 a partir da subscription sem persistir', () => {
    const plan = buildBillingPlanFromSubscription(sampleSubscription());
    expect(plan.subscription_id).toBe('sub-1');
    expect(plan.tenant_id).toBe('tenant-1');
    expect(plan.version).toBe(1);
    expect(plan.status).toBe('draft');
    expect(plan.currency).toBe('BRL');
    expect(plan.billing_interval).toBe('monthly');
    expect(plan.created_from).toBe('subscription');
    expect(plan.engine_version).toBe('v2');
    expect(plan.billing_strategy).toBe('billing_plan_items');
    expect(plan.plan_revision).toBe(1);
    expect(plan.plan_state).toBe('draft');
    expect(plan.billing_frequency).toBe(1);
    expect(plan.billing_anchor).toBe(15);
    expect(plan.starts_at).toBe('2026-06-15');
    expect(plan.ends_at).toBe('2026-07-15');
    expect(plan.metadata.origin).toBeDefined();
    expect((plan.metadata.origin as { mapped_from_subscription_id: string }).mapped_from_subscription_id).toBe('sub-1');
  });

  it('trial_until preenchido quando subscription trialing', () => {
    const plan = buildBillingPlanFromSubscription(
      sampleSubscription({ status: 'trialing', current_period_end: '2026-08-01' })
    );
    expect(plan.trial_until).toBe('2026-08-01');
  });
});
