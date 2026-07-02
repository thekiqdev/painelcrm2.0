import { describe, it, expect } from 'vitest';
import { BillingPlanAggregate } from './billingPlanAggregate.js';
import type { BillingPlanRow } from './types.js';

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
    metadata: { origin: { source: 'test' } },
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };
}

describe('BillingPlanAggregate', () => {
  it('reúne plan, identity, metadata e items vazio', () => {
    const agg = BillingPlanAggregate.fromPlanRow(samplePlan());
    expect(agg.plan.id).toBe('p1');
    expect(agg.identity.plan_number).toBe('BP-00000001');
    expect(agg.metadata.origin.source).toBe('test');
    expect(agg.items).toEqual([]);
    expect(agg.cycles).toEqual([]);
    expect(agg.currentRevision).toBeNull();
    expect(agg.revisionHistory).toEqual([]);
    expect(agg.snapshots).toEqual([]);
  });
});
