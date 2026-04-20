import { describe, expect, it } from 'vitest';
import { resolvePublicUnitPriceBrl } from './storePublicCheckoutService.js';

describe('resolvePublicUnitPriceBrl', () => {
  it('usa preço cheio quando desconto é maior ou igual', () => {
    expect(resolvePublicUnitPriceBrl({ price: 100, discount_price: 100 })).toBe(100);
    expect(resolvePublicUnitPriceBrl({ price: 100, discount_price: 120 })).toBe(100);
  });

  it('usa desconto quando menor que preço', () => {
    expect(resolvePublicUnitPriceBrl({ price: 100, discount_price: 80 })).toBe(80);
  });

  it('aceita só discount_price quando price é null', () => {
    expect(resolvePublicUnitPriceBrl({ price: null, discount_price: 50 })).toBe(50);
  });

  it('rejeita zero e negativos', () => {
    expect(resolvePublicUnitPriceBrl({ price: 0, discount_price: null })).toBeNull();
    expect(resolvePublicUnitPriceBrl({ price: -1, discount_price: null })).toBeNull();
  });
});
