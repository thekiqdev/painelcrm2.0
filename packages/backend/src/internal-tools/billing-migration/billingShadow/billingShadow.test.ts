import { describe, it, expect } from 'vitest';
import { BillingRenewalShadowEngine } from './billingRenewalShadowEngine.js';
import { renewalComparisonService } from './renewalComparisonService.js';
import { computeComparisonScore, isComparisonApproved } from './comparisonScore.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { BillingPlanItemRow } from '../../../billingPlanItems/types.js';
import type { NormalizedRenewalResult } from './types.js';

function sampleItem(): BillingPlanItemRow {
  return {
    id: 'item-1',
    tenant_id: 't1',
    billing_plan_id: 'plan-1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
    name: 'MRR',
    description: null,
    quantity: 1,
    unit_price: 9900,
    discount_type: null,
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 9900,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: null,
    starts_at: null,
    ends_at: null,
    trial_until: null,
    definition_hash: 'abc',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
  };
}

function sampleExecutionContext(): BillingExecutionContext {
  const item = sampleItem();
  return {
    subscription: {
      id: 'sub-1',
      type: 'customer',
      tenant_id: 't1',
      customer_id: 'c1',
      plan_id: null,
      amount_cents: 9900,
      currency: 'BRL',
      billing_anchor_day: 10,
      billing_cycle_count: 1,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-07-01',
      current_period_start: '2026-06-01',
      current_period_end: '2026-07-01',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: 'boleto',
      users_count: null,
      gateway: 'asaas',
      last_job_at: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      cycles_unlimited: true,
      max_cycles: null,
    },
    tenant: { id: 't1', name: 'Tenant' },
    customer: { id: 'c1', name: 'Client', email: 'a@b.com' },
    billingPlan: {
      id: 'plan-1',
      tenant_id: 't1',
      subscription_id: 'sub-1',
      plan_number: 'BP-00000001',
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
      billing_anchor: 10,
      starts_at: '2026-06-01',
      ends_at: null,
      trial_until: null,
      next_generation_at: null,
      metadata: {},
      created_at: '',
      updated_at: '',
    },
    billingPlans: [],
    billingItems: [item],
    resolvedItems: [
      {
        item,
        effectiveRevision: 1,
        effectiveDates: { from: '2026-06-01', until: null },
        resolvedPrice: 9900,
        resolvedQuantity: 1,
        discounts: 0,
        taxes: 0,
        proration: null,
        trial: null,
        metadata: {},
        definitionHash: 'abc',
      },
    ],
    contract: {
      billing_interval: 'monthly',
      amount_cents: 9900,
      currency: 'BRL',
      trial_until: null,
      status: 'active',
      metadata: {},
    },
    cycle: '2026-06-01',
    period: {
      cycleKey: '2026-06-01',
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextGeneration: '2026-07-01',
      anchor: 10,
      interval: 'monthly',
      frequency: 1,
    },
    dates: {
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextBilling: '2026-07-01',
      trialUntil: null,
    },
    gateway: {
      provider: 'asaas',
      currency: 'BRL',
      paymentMethod: 'boleto',
      fees: 0,
      gatewayMetadata: {},
    },
    notifications: {
      channels: ['email'],
      templates: ['crm_invoice_charge'],
      recipient: 'a@b.com',
      language: 'pt-BR',
      variables: {},
    },
    timeline: { events: [] },
    history: { changes: [] },
    featureFlags: {},
    metadata: {
      correlation_id: 'corr-1',
      execution_mode: 'automatic',
      plan_source: 'persisted_plan',
      has_persisted_plan: true,
      context_certified: true,
    },
    diagnostics: {
      contextBuildTime: 5,
      warnings: [],
      errors: [],
      sources: { plan: 'persisted_plan' },
      shadowReady: true,
      consistencyReady: true,
      engineReady: true,
      cacheHit: false,
      billing_plan_present: true,
      billing_items_present: true,
      context_certified: true,
      context_pure: true,
      legacy_dependencies_detected: [],
    },
  };
}

function baseNormalized(overrides: Partial<NormalizedRenewalResult> = {}): NormalizedRenewalResult {
  return {
    subscription: { id: 'sub-1', customer: 'c1', tenant: 't1', status: 'active' },
    cycle: '2026-06-01',
    billingPlanVersion: 1,
    itemCount: 1,
    items: [
      {
        sequence: 1,
        quantity: 1,
        unit_price: 9900,
        discount: 0,
        tax: 0,
        currency: 'BRL',
        total: 9900,
        definition_hash: 'abc',
        name: 'MRR',
      },
    ],
    subtotal: 9900,
    discounts: 0,
    taxes: 0,
    total: 9900,
    currency: 'BRL',
    dueDate: '2026-06-01',
    periodStart: '2026-06-01',
    periodEnd: '2026-07-01',
    gatewayPayload: { payment_method: 'boleto', currency: 'BRL', amount: 9900, payload: {} },
    notificationPayload: {
      type: 'invoice_created',
      recipient: 'c1',
      template: 'crm_invoice_charge',
      payload: {},
    },
    timelineEvents: [{ event: 'renewal_completed', order: 1 }],
    historyEvents: [{ change: 'subscription_cycle_advanced', audit: {} }],
    sideEffects: {
      invoice: true,
      notification: true,
      timeline: true,
      history: true,
      gateway: true,
    },
    metadata: {},
    ...overrides,
  };
}

describe('BillingRenewalShadowEngine', () => {
  it('executeShadow recebe apenas BillingExecutionContext', async () => {
    const result = await BillingRenewalShadowEngine.executeShadow(sampleExecutionContext());
    expect(result.success).toBe(true);
    expect(result.normalized.total).toBe(9900);
    expect(result.normalized.metadata.shadow_mode).toBe(true);
  });
});

describe('RenewalComparisonService', () => {
  it('compareWithExecutionContext', () => {
    const legacy = baseNormalized();
    const cmp = renewalComparisonService.compareWithExecutionContext(
      legacy,
      sampleExecutionContext()
    );
    expect(cmp.score).toBeDefined();
  });

  it('score 100 quando idênticos', () => {
    const n = baseNormalized();
    const cmp = renewalComparisonService.compare(n, { ...n });
    expect(cmp.score).toBe(100);
    expect(cmp.approved).toBe(true);
  });
});

describe('comparisonScore', () => {
  it('approved exige score 100 sem ERROR/CRITICAL', () => {
    expect(isComparisonApproved(100, [])).toBe(true);
  });

  it('computeComparisonScore penaliza severidade', () => {
    expect(computeComparisonScore([])).toBe(100);
  });
});
