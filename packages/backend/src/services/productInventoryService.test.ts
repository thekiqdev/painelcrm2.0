import { describe, expect, it, vi } from 'vitest';
import {
  hasEnoughStock,
  InsufficientStockError,
  InventoryValidationError,
  decrementInventoryForCheckout,
} from './productInventoryService.js';

describe('hasEnoughStock', () => {
  it('aceita estoque suficiente', () => {
    expect(hasEnoughStock(5, 1)).toBe(true);
    expect(hasEnoughStock(1, 1)).toBe(true);
  });

  it('rejeita insuficiente, zero qty ou null', () => {
    expect(hasEnoughStock(0, 1)).toBe(false);
    expect(hasEnoughStock(2, 3)).toBe(false);
    expect(hasEnoughStock(null, 1)).toBe(false);
    expect(hasEnoughStock(5, 0)).toBe(false);
  });
});

describe('decrementInventoryForCheckout', () => {
  const base = {
    productId: 'prod-1',
    quantity: 2,
    storeUserId: 'user-1',
    tenantId: 'tenant-1',
  };

  it('pula baixa quando track_inventory=false', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'prod-1', has_variants: false, track_inventory: false, stock_quantity: 10 }],
    });
    const result = await decrementInventoryForCheckout({ query }, { ...base, variantId: null });
    expect(result).toEqual({ trackInventory: false, remaining: 10, scope: 'skipped' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('baixa produto simples com FOR UPDATE', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'prod-1', has_variants: false, track_inventory: true, stock_quantity: 5 }],
      })
      .mockResolvedValueOnce({ rows: [{ stock_quantity: 3 }] });

    const result = await decrementInventoryForCheckout({ query }, { ...base, variantId: null });
    expect(result).toEqual({ trackInventory: true, remaining: 3, scope: 'product' });
    expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(query.mock.calls[1][0]).toMatch(/UPDATE products/i);
  });

  it('baixa variante e sincroniza estoque do pai', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'prod-1', has_variants: true, track_inventory: true, stock_quantity: 10 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'var-1', stock_quantity: 4, is_active: true }],
      })
      .mockResolvedValueOnce({ rows: [{ stock_quantity: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await decrementInventoryForCheckout(
      { query },
      { ...base, variantId: 'var-1', quantity: 2 }
    );
    expect(result).toEqual({ trackInventory: true, remaining: 2, scope: 'variant' });
    expect(query.mock.calls[1][0]).toMatch(/product_variants[\s\S]*FOR UPDATE/i);
    expect(query.mock.calls[2][0]).toMatch(/UPDATE product_variants/i);
    expect(query.mock.calls[3][0]).toMatch(/SUM\(pv\.stock_quantity\)/i);
  });

  it('409 quando estoque da variante é insuficiente', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'prod-1', has_variants: true, track_inventory: true, stock_quantity: 1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'var-1', stock_quantity: 1, is_active: true }],
      });

    await expect(
      decrementInventoryForCheckout({ query }, { ...base, variantId: 'var-1', quantity: 3 })
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('valida variante obrigatória em produto variável', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'prod-1', has_variants: true, track_inventory: true, stock_quantity: 5 }],
    });
    await expect(
      decrementInventoryForCheckout({ query }, { ...base, variantId: null })
    ).rejects.toBeInstanceOf(InventoryValidationError);
  });
});
