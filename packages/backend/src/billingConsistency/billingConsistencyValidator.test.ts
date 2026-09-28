import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingConsistencyValidator } from './billingConsistencyValidator.js';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';

describe('BillingConsistencyValidator', () => {
  const validator = new BillingConsistencyValidator();

  beforeEach(() => vi.clearAllMocks());

  it('validateFromContext sem re-resolver subscription', () => {
    const context = {
      subscription: {
        id: 'sub-1',
        tenant_id: 't1',
        type: 'customer',
        customer_id: 'c1',
        currency: 'BRL',
        billing_interval: 'monthly',
        status: 'active',
        billing_anchor_day: null,
        amount_cents: 0,
        next_billing_date: '2026-07-01',
        current_period_start: '2026-06-01',
        current_period_end: null,
      },
      billingPlans: [],
      billingPlan: {
        id: 'p1',
        tenant_id: 't1',
        subscription_id: 'sub-1',
        plan_number: 'BP-1',
        status: 'active',
        version: 1,
        plan_revision: 1,
        plan_state: 'running',
        created_from: 'subscription',
        engine_version: 'v2',
        billing_strategy: 'billing_plan_items',
        currency: 'BRL',
        billing_interval: 'monthly',
        billing_frequency: 1,
        billing_anchor: null,
        starts_at: '2026-06-01',
        ends_at: null,
        trial_until: null,
        next_generation_at: null,
        metadata: {},
        created_at: '',
        updated_at: '',
      },
      billingItems: [],
      metadata: {
        has_persisted_plan: true,
        correlation_id: null,
        execution_mode: null,
        plan_source: 'persisted_plan',
        context_certified: true,
      },
    } as unknown as BillingExecutionContext;

    const result = validator.validateFromContext(context);
    expect(result.metadata.has_persisted_plan).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });
});
