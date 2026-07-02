import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPlanRepository } from './billingPlanRepository.js';

describe('BillingPlanRepository', () => {
  const db = { query: vi.fn() };
  const repo = new BillingPlanRepository(db as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create insere e retorna row mapeada', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: '1' }] })
      .mockResolvedValueOnce({
      rows: [
        {
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
          billing_anchor: 10,
          starts_at: '2026-06-01',
          ends_at: null,
          trial_until: null,
          next_generation_at: null,
          metadata: {},
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    const row = await repo.create({
      tenant_id: 't1',
      subscription_id: 'sub-1',
      status: 'draft',
      version: 1,
      currency: 'BRL',
      billing_interval: 'monthly',
      billing_frequency: 1,
      billing_anchor: 10,
      starts_at: '2026-06-01',
      ends_at: null,
      trial_until: null,
      next_generation_at: null,
    });

    expect(row.id).toBe('plan-1');
    expect(row.plan_number).toBe('BP-00000001');
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('existsPlanNumber', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ c: '1' }] });
    expect(await repo.existsPlanNumber('BP-00000001')).toBe(true);
  });

  it('findByPlanNumber', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const row = await repo.findByPlanNumber('BP-00000099', 't1');
    expect(row).toBeNull();
  });

  it('findActiveBySubscription filtra status active', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const row = await repo.findActiveBySubscription('sub-1', 't1');
    expect(row).toBeNull();
    expect(String(db.query.mock.calls[0][0])).toContain("status = 'active'");
  });
});
