import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPlanService } from './billingPlanService.js';
import type { BillingPlanRow } from './types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';

function planRow(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
  return {
    id: 'plan-1',
    tenant_id: 't1',
    subscription_id: 'sub-1',
    plan_number: 'BP-00000001',
    status: 'draft',
    version: 1,
    plan_revision: 1,
    plan_state: 'draft',
    created_from: 'subscription',
    engine_version: 'v1',
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
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function subscription(): SubscriptionRow {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer',
    customer_id: 'c1',
    plan_id: null,
    amount_cents: 1000,
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

describe('BillingPlanService', () => {
  const repo = {
    create: vi.fn(),
    findById: vi.fn(),
    findActiveBySubscription: vi.fn(),
    findVersions: vi.fn(),
    archive: vi.fn(),
    activate: vi.fn(),
    archiveActiveForSubscription: vi.fn(),
    updateMetadata: vi.fn(),
  };
  const service = new BillingPlanService(repo as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createInitialPlan cria v1 quando não há versões', async () => {
    repo.findVersions.mockResolvedValueOnce([]);
    repo.create.mockResolvedValueOnce(planRow());
    const created = await service.createInitialPlan(subscription());
    expect(created.version).toBe(1);
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('createInitialPlan falha se já existir plano', async () => {
    repo.findVersions.mockResolvedValueOnce([planRow()]);
    await expect(service.createInitialPlan(subscription())).rejects.toThrow(
      'billing_plan_initial_already_exists'
    );
  });

  it('duplicatePlan incrementa versão', async () => {
    repo.findById.mockResolvedValueOnce(planRow({ version: 2 }));
    repo.findVersions.mockResolvedValueOnce([planRow({ version: 2 })]);
    repo.create.mockResolvedValueOnce(planRow({ id: 'plan-2', version: 3, status: 'draft' }));
    const dup = await service.duplicatePlan('plan-1', 't1');
    expect(dup.version).toBe(3);
    expect(repo.create.mock.calls[0][0].version).toBe(3);
  });

  it('activatePlan arquiva active anterior e ativa novo', async () => {
    repo.findById.mockResolvedValueOnce(planRow({ status: 'draft', version: 2 }));
    repo.archiveActiveForSubscription.mockResolvedValueOnce(1);
    repo.activate.mockResolvedValueOnce(planRow({ status: 'active', version: 2 }));
    const active = await service.activatePlan('plan-1', 't1');
    expect(active.status).toBe('active');
    expect(repo.archiveActiveForSubscription).toHaveBeenCalledWith('sub-1', 't1');
  });

  it('archivePlan marca archived', async () => {
    repo.archive.mockResolvedValueOnce(planRow({ status: 'archived' }));
    const archived = await service.archivePlan('plan-1', 't1');
    expect(archived.status).toBe('archived');
  });

  it('placeholders createRevision lançam not_implemented', async () => {
    await expect(service.createRevision('p', 't')).rejects.toThrow(
      'billing_plan_create_revision_not_implemented'
    );
  });
});
