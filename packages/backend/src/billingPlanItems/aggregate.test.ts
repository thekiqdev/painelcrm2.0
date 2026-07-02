import { describe, it, expect } from 'vitest';
import {
  attachItemsToBillingPlanAggregate,
  resolveCurrentItemRevision,
} from './aggregate.js';
import { BillingPlanAggregate } from '../billingPlan/billingPlanAggregate.js';
import { buildBillingItemSnapshot } from '../billingPlanItemSnapshot/factory.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import type { BillingPlanItemRow } from './types.js';

function samplePlan(): BillingPlanRow {
  return {
    id: 'p1',
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
    created_at: '',
    updated_at: '',
  };
}

function sampleItem(overrides: Partial<BillingPlanItemRow> = {}): BillingPlanItemRow {
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
    definition_hash: 'hash',
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

describe('BillingPlanItem aggregate composition', () => {
  it('attachItemsToBillingPlanAggregate compõe items[]', () => {
    const agg = attachItemsToBillingPlanAggregate(samplePlan(), [sampleItem()]);
    expect(agg.items).toHaveLength(1);
    expect(agg.items[0].name).toBe('MRR');
  });

  it('compõe currentRevision, revisionHistory e snapshots', () => {
    const items = [sampleItem({ item_revision: 1 }), sampleItem({ id: 'i2', item_revision: 2 })];
    const snapshots = items.map((i) => buildBillingItemSnapshot(i));
    const agg = attachItemsToBillingPlanAggregate(samplePlan(), items, {
      currentRevision: 2,
      revisionHistory: items,
      snapshots,
    });
    expect(agg.currentRevision).toBe(2);
    expect(agg.revisionHistory).toHaveLength(2);
    expect(agg.snapshots).toHaveLength(2);
  });

  it('resolveCurrentItemRevision', () => {
    expect(resolveCurrentItemRevision([sampleItem({ item_revision: 1 }), sampleItem({ item_revision: 3 })])).toBe(3);
    expect(resolveCurrentItemRevision([])).toBeNull();
  });

  it('BillingPlanAggregate default items vazio', () => {
    const agg = BillingPlanAggregate.fromPlanRow(samplePlan());
    expect(agg.items).toEqual([]);
    expect(agg.currentRevision).toBeNull();
    expect(agg.revisionHistory).toEqual([]);
    expect(agg.snapshots).toEqual([]);
  });
});
