import { describe, it, expect } from 'vitest';
import { billingPlanItemWriter } from './writer.js';
import { emptyBillingPlanItemsContext } from './context.js';
import { buildBillingItemSnapshot } from '../billingPlanItemSnapshot/factory.js';
import type { BillingPlanItemRow } from './types.js';

function sampleItem(): BillingPlanItemRow {
  return {
    id: 'i1',
    tenant_id: 't1',
    billing_plan_id: 'p1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
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
    definition_hash: 'h',
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

describe('BillingPlanItem writer/context', () => {
  it('writer lança not_implemented', async () => {
    await expect(billingPlanItemWriter.write([])).rejects.toThrow('not_implemented');
    await expect(
      billingPlanItemWriter.writeSnapshot(buildBillingItemSnapshot(sampleItem()))
    ).rejects.toThrow('not_implemented');
    await expect(
      billingPlanItemWriter.compareSnapshot(buildBillingItemSnapshot(sampleItem()))
    ).rejects.toThrow('not_implemented');
    await expect(
      billingPlanItemWriter.validateSnapshot(buildBillingItemSnapshot(sampleItem()))
    ).rejects.toThrow('not_implemented');
  });

  it('emptyBillingPlanItemsContext com placeholders 2.2A', () => {
    const ctx = emptyBillingPlanItemsContext();
    expect(ctx.items).toEqual([]);
    expect(ctx.currentRevision).toBeNull();
    expect(ctx.definitionHash).toBeNull();
    expect(ctx.snapshot).toBeNull();
    expect(ctx.futureSnapshot).toBeNull();
  });
});
