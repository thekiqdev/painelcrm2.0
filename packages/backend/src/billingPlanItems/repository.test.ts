import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPlanItemRepository } from './repository.js';

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    tenant_id: 't1',
    billing_plan_id: 'plan-1',
    sequence: 1,
    status: 'draft',
    item_type: 'service',
    origin: 'subscription',
    name: 'Test',
    description: null,
    quantity: 1,
    unit_price: 1000,
    discount_type: 'none',
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 1000,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: 'none',
    starts_at: null,
    ends_at: null,
    trial_until: null,
    definition_hash: 'hash1',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BillingPlanItemRepository', () => {
  const db = { query: vi.fn() };
  const repo = new BillingPlanItemRepository(db as never);

  beforeEach(() => vi.clearAllMocks());

  it('create retorna row', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleRow()] });
    const row = await repo.create({
      tenant_id: 't1',
      billing_plan_id: 'plan-1',
      sequence: 1,
      name: 'Test',
      unit_price: 1000,
      total_amount: 1000,
      currency: 'BRL',
      effective_from: '2026-06-01',
    });
    expect(row.id).toBe('item-1');
    expect(row.item_revision).toBe(1);
  });

  it('findActive filtra status active', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await repo.findActive('plan-1', 't1');
    expect(String(db.query.mock.calls[0][0])).toContain("status = 'active'");
  });

  it('findRevision por sequence e revision', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleRow({ item_revision: 2 })] });
    const row = await repo.findRevision('plan-1', 1, 2, 't1');
    expect(row?.item_revision).toBe(2);
  });

  it('findEffective filtra vigência', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await repo.findEffective('plan-1', 't1', '2026-06-15');
    expect(String(db.query.mock.calls[0][0])).toContain('effective_from');
    expect(String(db.query.mock.calls[0][0])).toContain('effective_until');
  });

  it('findCurrent ordena por item_revision DESC', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleRow({ item_revision: 3 })] });
    const row = await repo.findCurrent('plan-1', 1, 't1');
    expect(row?.item_revision).toBe(3);
  });

  it('findByDefinitionHash', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleRow()] });
    const rows = await repo.findByDefinitionHash('plan-1', 'hash1', 't1');
    expect(rows).toHaveLength(1);
  });

  it('exists', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ c: '1' }] });
    expect(await repo.exists('item-1', 't1')).toBe(true);
  });
});
