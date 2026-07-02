import { describe, it, expect } from 'vitest';
import { BillingPlanMetadata } from './billingPlanMetadata.js';

describe('BillingPlanMetadata', () => {
  it('parse legacy flat metadata', () => {
    const m = BillingPlanMetadata.fromJson({
      source: 'billing_plan_factory',
      mapped_from_subscription_id: 'sub-1',
    });
    expect(m.origin.source).toBe('billing_plan_factory');
    expect(m.origin.mapped_from_subscription_id).toBe('sub-1');
  });

  it('round-trip toJson', () => {
    const m = BillingPlanMetadata.fromJson({
      engine: { billing_strategy: 'billing_plan_items' },
    });
    const json = m.toJson();
    expect((json.engine as { billing_strategy: string }).billing_strategy).toBe(
      'billing_plan_items'
    );
  });
});
