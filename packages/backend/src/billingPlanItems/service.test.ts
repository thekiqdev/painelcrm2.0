import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingPlanItemService } from './service.js';

describe('BillingPlanItemService', () => {
  const repo = {
    create: vi.fn(),
    duplicateItems: vi.fn(),
    archive: vi.fn(),
    setStatus: vi.fn(),
    findByBillingPlan: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    duplicateRevision: vi.fn(),
    findRevision: vi.fn(),
    findCurrent: vi.fn(),
  };
  const service = new BillingPlanItemService(repo as never);

  beforeEach(() => vi.clearAllMocks());

  const item = {
    id: 'i1',
    tenant_id: 't1',
    billing_plan_id: 'p1',
    sequence: 1,
    status: 'active' as const,
    item_type: 'service' as const,
    origin: 'subscription' as const,
    name: 'X',
    description: null,
    quantity: 1,
    unit_price: 100,
    discount_type: null,
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 100,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: null,
    starts_at: null,
    ends_at: null,
    trial_until: null,
    definition_hash: 'h1',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot' as const,
    metadata: {},
    created_at: '',
    updated_at: '',
  };

  it('pauseItem e activateItem', async () => {
    repo.findById.mockResolvedValue(item);
    repo.setStatus.mockResolvedValueOnce({ ...item, status: 'paused' });
    const paused = await service.pauseItem('i1', 't1');
    expect(paused.status).toBe('paused');
    repo.findById.mockResolvedValue({ ...item, status: 'paused' });
    repo.setStatus.mockResolvedValueOnce({ ...item, status: 'active' });
    const active = await service.activateItem('i1', 't1');
    expect(active.status).toBe('active');
  });

  it('archiveItem', async () => {
    repo.findById.mockResolvedValue(item);
    repo.archive.mockResolvedValueOnce({ ...item, status: 'archived' });
    const archived = await service.archiveItem('i1', 't1');
    expect(archived.status).toBe('archived');
  });

  it('createItem calcula definition_hash', async () => {
    repo.create.mockImplementation(async (input) => ({ ...item, ...input }));
    const created = await service.createItem({
      tenant_id: 't1',
      billing_plan_id: 'p1',
      sequence: 1,
      name: 'X',
      unit_price: 100,
      total_amount: 100,
      currency: 'BRL',
      effective_from: '2026-06-01',
    });
    expect(created.definition_hash).toBeTruthy();
  });

  it('createRevision via duplicateRevision', async () => {
    repo.duplicateRevision.mockResolvedValueOnce({ ...item, item_revision: 2 });
    const rev = await service.createRevision('i1', 't1');
    expect(rev.item_revision).toBe(2);
  });

  it('compareRevision', async () => {
    repo.findRevision
      .mockResolvedValueOnce({ ...item, item_revision: 1, definition_hash: 'a' })
      .mockResolvedValueOnce({ ...item, item_revision: 2, definition_hash: 'b' });
    const cmp = await service.compareRevision('p1', 1, 1, 2, 't1');
    expect(cmp.definitionHashEqual).toBe(false);
  });

  it('getCurrentRevision', async () => {
    repo.findCurrent.mockResolvedValueOnce({ ...item, item_revision: 3 });
    const current = await service.getCurrentRevision('p1', 1, 't1');
    expect(current?.item_revision).toBe(3);
  });
});
