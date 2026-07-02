import { describe, it, expect } from 'vitest';
import { resolveProjectionItems } from './projectionItemResolver.js';
import { calculateProjectionPrices } from './projectionPriceCalculator.js';
import { calculateProjectionDiscounts, sumProjectionDiscounts } from './projectionDiscountCalculator.js';
import { calculateProjectionTaxes, sumProjectionTaxes } from './projectionTaxCalculator.js';
import { calculateProjectionTotals } from './projectionTotalCalculator.js';
import { resolveProjectionGateway } from './projectionGatewayResolver.js';
import { resolveProjectionNotification } from './projectionNotificationResolver.js';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';

const baseContext = {
  subscription: { id: 's1', currency: 'BRL' },
  billingPlan: { id: 'p1', currency: 'BRL' },
  cycle: '2026-06-01',
  gateway: { paymentMethod: 'pix', currency: 'BRL', provider: 'asaas', fees: 100, gatewayMetadata: {} },
  notifications: { recipient: 'c1', templates: ['t1'], language: 'pt-BR', variables: {}, channels: [] },
  resolvedItems: [
    {
      item: { sequence: 1, name: 'X', currency: 'BRL', total_amount: 900, billing_interval: 'monthly' },
      effectiveRevision: 1,
      resolvedPrice: 1000,
      resolvedQuantity: 1,
      discounts: 100,
      taxes: 0,
      definitionHash: 'h1',
    },
  ],
} as unknown as BillingExecutionContext;

describe('Projection calculators', () => {
  it('pipeline de preços até totais', () => {
    const items = resolveProjectionItems(baseContext);
    const priced = calculateProjectionPrices(items);
    const discounted = calculateProjectionDiscounts(priced);
    const taxed = calculateProjectionTaxes(discounted);
    const totals = calculateProjectionTotals(taxed, 100);

    expect(totals.subtotal).toBe(1000);
    expect(sumProjectionDiscounts(discounted)).toBe(100);
    expect(sumProjectionTaxes(taxed)).toBe(0);
    expect(totals.grandTotal).toBe(900);
    expect(totals.fees).toBe(100);
  });

  it('gateway e notification null quando total zero', () => {
    expect(resolveProjectionGateway(baseContext, 0)).toBeNull();
    expect(resolveProjectionNotification(baseContext, 0)).toBeNull();
  });

  it('gateway resolve com total positivo', () => {
    const gw = resolveProjectionGateway(baseContext, 900);
    expect(gw?.amount).toBe(900);
    expect(gw?.payment_method).toBe('pix');
  });
});
