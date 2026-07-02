import { describe, it, expect } from 'vitest';
import { validateBillingPlan } from './checks/planChecks.js';
import { validateBillingItems } from './checks/itemChecks.js';
import { validatePlanItemIntegration } from './checks/integrationChecks.js';
import { validateContractConsistency } from './checks/contractChecks.js';
import { billingConfidenceCalculator } from './billingConfidenceCalculator.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { DEPRECATED_BILLING_STRATEGY_INVOICE_COPY } from '../billingPlan/deprecatedBillingStrategies.js';

function samplePlan(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
  return {
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
    ...overrides,
  };
}

function sampleItem(overrides: Partial<BillingPlanItemRow> = {}): BillingPlanItemRow {
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
    ...overrides,
  };
}

function sampleSubscription(): SubscriptionRow {
  return {
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
    default_payment_method: null,
    users_count: null,
    gateway: null,
    last_job_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    cycles_unlimited: true,
    max_cycles: null,
  };
}

describe('planChecks', () => {
  it('plano válido passa checks principais', () => {
    const plan = samplePlan();
    const checks = validateBillingPlan([plan], plan);
    expect(checks.find((c) => c.code === 'single_active_plan')?.passed).toBe(true);
    expect(checks.find((c) => c.code === 'plan_status_valid')?.passed).toBe(true);
  });

  it('múltiplos planos ativos falha CRITICAL', () => {
    const p1 = samplePlan({ id: 'p1' });
    const p2 = samplePlan({ id: 'p2', plan_number: 'BP-00000002' });
    const checks = validateBillingPlan([p1, p2], p1);
    expect(checks.find((c) => c.code === 'single_active_plan')?.passed).toBe(false);
    expect(checks.find((c) => c.code === 'single_active_plan')?.severity).toBe('CRITICAL');
  });

  it('plano órfão (ausente) gera warning', () => {
    const checks = validateBillingPlan([], null);
    expect(checks.find((c) => c.code === 'plan_exists')?.passed).toBe(false);
  });
});

describe('itemChecks', () => {
  it('itens válidos passam sequence e amounts', () => {
    const checks = validateBillingItems([sampleItem()]);
    expect(checks.find((c) => c.code === 'sequence_continuous')?.passed).toBe(true);
    expect(checks.find((c) => c.code === 'items_present')?.passed).toBe(true);
  });

  it('sequence quebrada falha', () => {
    const checks = validateBillingItems([
      sampleItem({ sequence: 1 }),
      sampleItem({ id: 'i2', sequence: 3 }),
    ]);
    expect(checks.find((c) => c.code === 'sequence_continuous')?.passed).toBe(false);
  });

  it('currency inválida falha', () => {
    const checks = validateBillingItems([sampleItem({ currency: '' })]);
    expect(checks.some((c) => c.field === 'currency' && !c.passed)).toBe(true);
  });
});

describe('integrationChecks', () => {
  it('item órfão de plano falha CRITICAL', () => {
    const plan = samplePlan();
    const item = sampleItem({ billing_plan_id: 'other-plan' });
    const checks = validatePlanItemIntegration(plan, [item]);
    expect(checks.some((c) => c.code.includes('belongs_to_plan') && !c.passed)).toBe(true);
  });
});

describe('contractChecks', () => {
  it('interval e currency alinhados', () => {
    const checks = validateContractConsistency(sampleSubscription(), samplePlan());
    expect(checks.find((c) => c.code === 'contract_interval')?.passed).toBe(true);
    expect(checks.find((c) => c.code === 'contract_currency')?.passed).toBe(true);
  });

  it('billing strategy inválida no plano não bloqueia contract', () => {
    const checks = validateContractConsistency(
      sampleSubscription(),
      samplePlan({
        billing_strategy: DEPRECATED_BILLING_STRATEGY_INVOICE_COPY as ReturnType<typeof samplePlan>['billing_strategy'],
      })
    );
    expect(checks.find((c) => c.code === 'contract_subscription_id')?.passed).toBe(true);
  });
});

describe('BillingConfidenceCalculator', () => {
  it('confidence 100 sem falhas', () => {
    const { confidence, score } = billingConfidenceCalculator.compute([
      { code: 'ok', phase: 'plan', passed: true, severity: 'INFO', message: 'ok' },
    ]);
    expect(confidence).toBe(100);
    expect(score).toBe(100);
  });

  it('penaliza ERROR', () => {
    const { confidence } = billingConfidenceCalculator.compute([
      { code: 'bad', phase: 'items', passed: false, severity: 'ERROR', message: 'bad' },
    ]);
    expect(confidence).toBe(80);
  });
});
