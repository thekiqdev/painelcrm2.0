import { describe, it, expect } from 'vitest';
import { mapInvoiceItemsToBillingItems } from './mapper.js';

describe('BillingPlanItem mapper', () => {
  const invoice = {
    id: 'inv-1',
    tenant_id: 't1',
    subscription_id: 'sub-1',
    currency: 'BRL',
    period_start: '2026-06-01',
    period_end: '2026-07-01',
  };

  it('mapInvoiceItemsToBillingItems converte linhas sem persistir', () => {
    const inputs = mapInvoiceItemsToBillingItems({
      tenantId: 't1',
      billingPlanId: 'plan-1',
      invoice,
      lines: [
        {
          id: 'line-1',
          description: 'Mensalidade',
          quantity: 1,
          unit_price_cents: 9900,
          discount_cents: 0,
          total_cents: 9900,
          sort_order: 1,
          is_recurring: true,
          recurring_interval: 'monthly',
        },
      ],
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].name).toBe('Mensalidade');
    expect(inputs[0].unit_price).toBe(9900);
    expect(inputs[0].is_recurring).toBe(true);
    expect(inputs[0].metadata.source_invoice_item_id).toBe('line-1');
  });
});
