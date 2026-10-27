import { describe, expect, it } from 'vitest';
import { normalizeAppCurrency } from './appCurrency';

describe('normalizeAppCurrency (IX2)', () => {
  it('normaliza BRL USD EUR', () => {
    expect(normalizeAppCurrency('usd')).toBe('USD');
    expect(normalizeAppCurrency('EUR')).toBe('EUR');
    expect(normalizeAppCurrency('BRL')).toBe('BRL');
    expect(normalizeAppCurrency('mxn')).toBeNull();
  });
});
