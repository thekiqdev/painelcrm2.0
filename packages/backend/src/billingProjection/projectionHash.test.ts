import { describe, it, expect } from 'vitest';
import { computeProjectionHash } from './projectionHash.js';
import type { ProjectedInvoice } from './types.js';

function baseInvoice(overrides: Partial<ProjectedInvoice> = {}): ProjectedInvoice {
  return {
    invoice: {
      subscription_id: 's1',
      tenant_id: 't1',
      customer_id: 'c1',
      cycle_key: '2026-06-01',
      billing_plan_id: 'p1',
      billing_plan_version: 1,
      currency: 'BRL',
    },
    invoiceItems: [
      {
        sequence: 1,
        definitionHash: 'h1',
        description: 'Item',
        quantity: 1,
        unitPrice: 100,
        discount: 0,
        tax: 0,
        subtotal: 100,
        total: 100,
        currency: 'BRL',
        billingRule: 'monthly',
        effectiveRevision: 1,
      },
    ],
    subtotal: 100,
    discounts: 0,
    taxes: 0,
    fees: 0,
    grandTotal: 100,
    currency: 'BRL',
    period: {
      cycleKey: '2026-06-01',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      dueDate: '2026-06-01',
      nextGeneration: null,
      anchor: null,
      interval: 'monthly',
      frequency: 1,
    },
    dueDate: '2026-06-01',
    gateway: null,
    notifications: null,
    timeline: [],
    history: [],
    metadata: { dynamic: 'ignored' },
    diagnostics: {
      calculationTime: 1,
      warnings: [],
      errors: [],
      hash: '',
      calculatorVersions: {},
      cacheHit: false,
      builderVersion: '1.0.0',
    },
    ...overrides,
  };
}

describe('projectionHash', () => {
  it('mesmo conteúdo produz mesmo hash', () => {
    const a = baseInvoice();
    const b = baseInvoice();
    expect(computeProjectionHash(a)).toBe(computeProjectionHash(b));
  });

  it('mudança de preço altera hash', () => {
    const a = baseInvoice();
    const b = baseInvoice({ grandTotal: 200 });
    expect(computeProjectionHash(a)).not.toBe(computeProjectionHash(b));
  });

  it('metadata dinâmica não altera hash', () => {
    const a = baseInvoice({ metadata: { foo: 'bar' } });
    const b = baseInvoice({ metadata: { foo: 'baz' } });
    expect(computeProjectionHash(a)).toBe(computeProjectionHash(b));
  });
});
