import { describe, it, expect } from 'vitest';
import { BillingPlanIdentity } from './billingPlanIdentity.js';

describe('BillingPlanIdentity', () => {
  it('cria identity imutável', () => {
    const id = BillingPlanIdentity.create({
      plan_number: 'BP-00000001',
      subscription_id: 'sub-1',
      tenant_id: 't1',
      version: 2,
      revision: 3,
    });
    expect(id.plan_number).toBe('BP-00000001');
    expect(id.version).toBe(2);
    expect(id.revision).toBe(3);
    expect(id.toJSON().revision).toBe(3);
  });

  it('rejeita plan_number inválido', () => {
    expect(() =>
      BillingPlanIdentity.create({
        plan_number: 'X',
        subscription_id: 'sub-1',
        tenant_id: 't1',
        version: 1,
        revision: 1,
      })
    ).toThrow('billing_plan_identity_invalid_plan_number');
  });
});
