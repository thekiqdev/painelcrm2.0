import { describe, expect, it } from 'vitest';
import {
  computeItemSubtotalCents,
  computeTotalsFromItems,
} from './serviceOrdersService.js';

describe('serviceOrdersService totals', () => {
  it('computes line subtotal with discount', () => {
    expect(computeItemSubtotalCents(2, 6000, 0)).toBe(12000);
    expect(computeItemSubtotalCents(2, 6000, 500)).toBe(11500);
  });

  it('splits services and products', () => {
    const totals = computeTotalsFromItems([
      { kind: 'service', subtotal_cents: 23000 },
      { kind: 'product', subtotal_cents: 8000 },
      { kind: 'product', subtotal_cents: 12000 },
    ]);
    expect(totals.total_services_cents).toBe(23000);
    expect(totals.total_products_cents).toBe(20000);
    expect(totals.total_cents).toBe(43000);
  });
});
