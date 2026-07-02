import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';

const mockFindActive = vi.fn();
const mockFindVersions = vi.fn();
const mockFindEffective = vi.fn();
const mockFindByBillingPlan = vi.fn();
const mockCreatePlan = vi.fn();
const mockCreateItems = vi.fn();
const mockActivatePlan = vi.fn();
const mockDuplicatePlan = vi.fn();

vi.mock('../../billingPlan/billingPlanRepository.js', () => ({
  BillingPlanRepository: vi.fn().mockImplementation(() => ({
    findActiveBySubscription: (...args: unknown[]) => mockFindActive(...args),
    findVersions: (...args: unknown[]) => mockFindVersions(...args),
  })),
}));

vi.mock('../../billingPlan/billingPlanService.js', () => ({
  BillingPlanService: vi.fn().mockImplementation(() => ({
    activatePlan: (...args: unknown[]) => mockActivatePlan(...args),
    duplicatePlan: (...args: unknown[]) => mockDuplicatePlan(...args),
  })),
}));

vi.mock('../../billingPlanItems/repository.js', () => ({
  BillingPlanItemRepository: vi.fn().mockImplementation(() => ({
    findEffective: (...args: unknown[]) => mockFindEffective(...args),
    findByBillingPlan: (...args: unknown[]) => mockFindByBillingPlan(...args),
  })),
}));

vi.mock('./billingPlanAutoProvision.js', () => ({
  createActiveBillingPlanForSubscription: (...args: unknown[]) => mockCreatePlan(...args),
  createBillingPlanItemsForSubscription: (...args: unknown[]) => mockCreateItems(...args),
}));

import { repairBillingPlanForSubscription } from './billingPlanRepairService.js';

function subscription(): SubscriptionRow {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    customer_id: 'c1',
    plan_id: null,
    amount_cents: 3000,
    currency: 'BRL',
    billing_anchor_day: 1,
    billing_cycle_count: 0,
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-07-01',
    current_period_start: '2026-06-01',
    current_period_end: '2026-07-01',
    grace_period_days: 3,
    default_payment_method: null,
    users_count: null,
    gateway: null,
    cancel_at_period_end: false,
    last_job_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    cycles_unlimited: true,
    max_cycles: null,
  };
}

function plan(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
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
    billing_anchor: 1,
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

describe('billingPlanRepairService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindActive.mockReset();
    mockFindVersions.mockReset();
    mockFindEffective.mockReset();
    mockFindByBillingPlan.mockReset();
    mockCreatePlan.mockReset();
    mockCreateItems.mockReset();
    mockActivatePlan.mockReset();
    mockDuplicatePlan.mockReset();
  });

  it('reutiliza plano ativo existente', async () => {
    mockFindActive.mockResolvedValue(plan());
    mockFindEffective.mockResolvedValue([{ id: 'i1' }]);
    const result = await repairBillingPlanForSubscription(subscription());
    expect(result.createdPlan).toBe(false);
    expect(result.createdItems).toBe(false);
    expect(mockCreatePlan).not.toHaveBeenCalled();
  });

  it('ativa draft existente', async () => {
    mockFindActive.mockResolvedValue(null);
    mockFindVersions.mockResolvedValue([plan({ status: 'draft' })]);
    mockActivatePlan.mockResolvedValue(plan({ status: 'active' }));
    mockFindEffective.mockResolvedValue([{ id: 'i1' }]);
    const result = await repairBillingPlanForSubscription(subscription());
    expect(mockActivatePlan).toHaveBeenCalled();
    expect(result.plan.status).toBe('active');
  });

  it('duplica plano arquivado quando não há draft', async () => {
    mockFindActive.mockResolvedValue(null);
    mockFindVersions.mockResolvedValue([plan({ status: 'archived' })]);
    mockDuplicatePlan.mockResolvedValue(plan({ id: 'plan-2', status: 'draft' }));
    mockActivatePlan.mockResolvedValue(plan({ id: 'plan-2', status: 'active' }));
    mockFindEffective.mockResolvedValue([{ id: 'i1' }]);
    await repairBillingPlanForSubscription(subscription());
    expect(mockDuplicatePlan).toHaveBeenCalled();
  });

  it('cria plano e items quando inexistente', async () => {
    mockFindActive.mockResolvedValue(null);
    mockFindVersions.mockResolvedValue([]);
    mockCreatePlan.mockResolvedValue(plan());
    mockFindEffective.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockFindByBillingPlan.mockResolvedValue([]);
    mockCreateItems.mockResolvedValue([{ id: 'i1' }]);
    const result = await repairBillingPlanForSubscription(subscription());
    expect(mockCreatePlan).toHaveBeenCalled();
    expect(mockCreateItems).toHaveBeenCalled();
    expect(result.createdPlan).toBe(true);
    expect(result.createdItems).toBe(true);
  });

  it('repair sem duplicação quando items já efetivos', async () => {
    mockFindActive.mockResolvedValue(plan());
    mockFindEffective.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    const result = await repairBillingPlanForSubscription(subscription());
    expect(mockCreateItems).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
  });
});
