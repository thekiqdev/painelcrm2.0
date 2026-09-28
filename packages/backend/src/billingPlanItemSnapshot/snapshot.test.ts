import { describe, it, expect } from 'vitest';
import { buildBillingItemSnapshot } from './factory.js';
import { mapBillingItemSnapshotToInvoiceItem } from './mapper.js';
import { emptyBillingItemSnapshotContext } from './context.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';

function sampleItem(): BillingPlanItemRow {
  return {
    id: 'i1',
    tenant_id: 't1',
    billing_plan_id: 'p1',
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
    definition_hash: 'abc123',
    item_revision: 2,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: 1,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
  };
}

describe('billingPlanItemSnapshot', () => {
  it('buildBillingItemSnapshot sem gravar', () => {
    const snap = buildBillingItemSnapshot(sampleItem(), '2026-06-25T00:00:00.000Z');
    expect(snap.sourceItemId).toBe('i1');
    expect(snap.itemRevision).toBe(2);
    expect(snap.definitionHash).toBe('abc123');
    expect(snap.definition.name).toBe('MRR');
  });

  it('mapBillingItemSnapshotToInvoiceItem not_implemented', () => {
    const snap = buildBillingItemSnapshot(sampleItem());
    expect(() => mapBillingItemSnapshotToInvoiceItem(snap)).toThrow('not_implemented');
  });

  it('emptyBillingItemSnapshotContext', () => {
    const ctx = emptyBillingItemSnapshotContext();
    expect(ctx.snapshot).toBeNull();
    expect(ctx.futureSnapshot).toBeNull();
  });
});
