import { describe, expect, it } from 'vitest';
import { buildInvoiceItemsFromServiceOrder } from './serviceOrderInvoiceConversionService.js';

describe('buildInvoiceItemsFromServiceOrder', () => {
  it('mapeia linhas com cents sem multiplicar por 100', () => {
    const lines = buildInvoiceItemsFromServiceOrder(
      [
        {
          kind: 'service',
          name: 'Manutenção',
          quantity: 2,
          unit_price_cents: 15000,
          discount_cents: 500,
        },
      ],
      { number: 7, total_cents: 29500 },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.unit_price_cents).toBe(15000);
    expect(lines[0]!.discount_cents).toBe(500);
    expect(lines[0]!.quantity).toBe(2);
    expect(lines[0]!.description).toContain('Manutenção');
  });

  it('usa fallback pelo total quando não há itens válidos', () => {
    const lines = buildInvoiceItemsFromServiceOrder([], { number: 3, total_cents: 9900 });
    expect(lines).toEqual([
      {
        description: 'Ordem de Serviço Nº 3',
        quantity: 1,
        unit_price_cents: 9900,
        discount_cents: 0,
      },
    ]);
  });

  it('falha sem itens e sem total', () => {
    expect(() => buildInvoiceItemsFromServiceOrder([], { number: 1, total_cents: 0 })).toThrow(
      /sem itens válidos/i,
    );
  });
});
