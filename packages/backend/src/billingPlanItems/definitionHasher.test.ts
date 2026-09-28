import { describe, it, expect } from 'vitest';
import {
  BillingItemDefinitionHasher,
  extractBillingItemDefinitionPayload,
} from './definitionHasher.js';

const base = {
  name: 'MRR',
  description: 'Monthly',
  quantity: 1,
  unit_price: 9900,
  discount_type: 'none' as const,
  discount_value: 0,
  tax_rate: null,
  tax_value: 0,
  billing_interval: 'monthly',
  billing_frequency: 1,
  billing_anchor: 10,
  trial_until: null,
  proration_mode: 'none' as const,
  currency: 'BRL',
  metadata: { tier: 'pro' },
};

describe('BillingItemDefinitionHasher', () => {
  it('gera hash determinístico SHA-256', () => {
    const h1 = BillingItemDefinitionHasher.hash(extractBillingItemDefinitionPayload(base));
    const h2 = BillingItemDefinitionHasher.hash(extractBillingItemDefinitionPayload(base));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('muda hash quando definição estrutural muda', () => {
    const h1 = BillingItemDefinitionHasher.hash(extractBillingItemDefinitionPayload(base));
    const h2 = BillingItemDefinitionHasher.hash(
      extractBillingItemDefinitionPayload({ ...base, unit_price: 10000 })
    );
    expect(h1).not.toBe(h2);
  });

  it('metadata ordenada produz mesmo hash', () => {
    const h1 = BillingItemDefinitionHasher.hash({
      ...extractBillingItemDefinitionPayload(base),
      metadata: { a: 1, b: 2 },
    });
    const h2 = BillingItemDefinitionHasher.hash({
      ...extractBillingItemDefinitionPayload(base),
      metadata: { b: 2, a: 1 },
    });
    expect(h1).toBe(h2);
  });
});
