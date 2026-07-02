import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePlanAndItems } from './planItemResolver.js';
import { BillingExecutionContextError } from './errors.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { DEPRECATED_BILLING_STRATEGY_INVOICE_COPY } from '../billingPlan/deprecatedBillingStrategies.js';

vi.mock('../billingPlan/billingPlanRepository.js', () => ({
  billingPlanRepository: {
    findVersions: vi.fn(),
    findActiveBySubscription: vi.fn(),
  },
}));

vi.mock('../billingPlanItems/repository.js', () => ({
  billingPlanItemRepository: {
    findEffective: vi.fn(),
  },
}));

import { billingPlanRepository } from '../billingPlan/billingPlanRepository.js';
import { billingPlanItemRepository } from '../billingPlanItems/repository.js';

const subscription: SubscriptionRow = {
  id: 'sub-1',
  tenant_id: 't1',
  type: 'customer',
  customer_id: 'c1',
  currency: 'BRL',
  billing_interval: 'monthly',
  status: 'active',
  next_billing_date: '2026-07-01',
  current_period_start: '2026-06-01',
  current_period_end: '2026-07-01',
  billing_anchor_day: 10,
  amount_cents: 9900,
  plan_id: null,
  billing_cycle_count: 1,
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

function samplePlan(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
  return {
    id: 'plan-1',
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
    definition_hash: 'hash-1',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'logical_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('resolvePlanAndItems', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolve plano e items persistidos', async () => {
    const plan = samplePlan();
    const item = sampleItem();
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([plan]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(plan);
    vi.mocked(billingPlanItemRepository.findEffective).mockResolvedValue([item]);

    const result = await resolvePlanAndItems({
      subscription,
      periodStartYmd: '2026-06-01',
    });

    expect(result.planSource).toBe('persisted_plan');
    expect(result.hasPersistedPlan).toBe(true);
    expect(result.billingItems).toHaveLength(1);
    expect(result.billingPlan.id).toBe('plan-1');
  });

  it('falha sem Billing Plan persistido', async () => {
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(null);

    await expect(
      resolvePlanAndItems({ subscription, periodStartYmd: '2026-06-01' })
    ).rejects.toMatchObject({ code: 'BILLING_PLAN_NOT_FOUND' });
  });

  it('falha sem Billing Items efetivos', async () => {
    const plan = samplePlan();
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([plan]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(plan);
    vi.mocked(billingPlanItemRepository.findEffective).mockResolvedValue([]);

    await expect(
      resolvePlanAndItems({ subscription, periodStartYmd: '2026-06-01' })
    ).rejects.toMatchObject({ code: 'BILLING_ITEMS_NOT_FOUND' });
  });

  it('rejeita estratégia legada de cópia de fatura', async () => {
    const plan = samplePlan({
      billing_strategy: DEPRECATED_BILLING_STRATEGY_INVOICE_COPY as BillingPlanRow['billing_strategy'],
    });
    const item = sampleItem();
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([plan]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(plan);
    vi.mocked(billingPlanItemRepository.findEffective).mockResolvedValue([item]);

    await expect(
      resolvePlanAndItems({ subscription, periodStartYmd: '2026-06-01' })
    ).rejects.toMatchObject({ code: 'LEGACY_PLAN_STRATEGY' });
  });

  it('rejeita item virtual ctx-item-*', async () => {
    const plan = samplePlan();
    const item = sampleItem({ id: 'ctx-item-plan-1-1' });
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([plan]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(plan);
    vi.mocked(billingPlanItemRepository.findEffective).mockResolvedValue([item]);

    await expect(
      resolvePlanAndItems({ subscription, periodStartYmd: '2026-06-01' })
    ).rejects.toMatchObject({ code: 'LEGACY_ITEM_DETECTED' });
  });

  it('deduplica items por sequence mantendo maior revision', async () => {
    const plan = samplePlan();
    const older = sampleItem({ item_revision: 1, unit_price: 1000 });
    const newer = sampleItem({ item_revision: 2, unit_price: 2000 });
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([plan]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(plan);
    vi.mocked(billingPlanItemRepository.findEffective).mockResolvedValue([older, newer]);

    const result = await resolvePlanAndItems({
      subscription,
      periodStartYmd: '2026-06-01',
    });

    expect(result.billingItems).toHaveLength(1);
    expect(result.billingItems[0].unit_price).toBe(2000);
  });

  it('não importa crmRenewalCustomerResolver', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./planItemResolver.ts', import.meta.url), 'utf8')
    );
    expect(content.includes('resolveCrmRenewalPreviousInvoice')).toBe(false);
    expect(content.includes('crmRenewalCustomerResolver')).toBe(false);
  });

  it('não importa customerInvoiceService', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./planItemResolver.ts', import.meta.url), 'utf8')
    );
    expect(content.includes('getCustomerInvoiceItems')).toBe(false);
    expect(content.includes('customerInvoiceService')).toBe(false);
  });

  it('não importa buildBillingItemsFromInvoice', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./planItemResolver.ts', import.meta.url), 'utf8')
    );
    expect(content.includes('buildBillingItemsFromInvoice')).toBe(false);
  });
});

describe('resolvePlanAndItems — erros estruturados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BillingExecutionContextError tem code', async () => {
    vi.mocked(billingPlanRepository.findVersions).mockResolvedValue([]);
    vi.mocked(billingPlanRepository.findActiveBySubscription).mockResolvedValue(null);
    try {
      await resolvePlanAndItems({ subscription, periodStartYmd: '2026-06-01' });
    } catch (e) {
      expect(e).toBeInstanceOf(BillingExecutionContextError);
      expect((e as BillingExecutionContextError).code).toBe('BILLING_PLAN_NOT_FOUND');
    }
  });
});
