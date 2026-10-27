import { describe, expect, it } from 'vitest';
import {
  normalizeAppCurrency,
  resolveAppCurrency,
  readCountryFromRequest,
} from './appCurrency.js';

describe('normalizeAppCurrency (IX2)', () => {
  it('aceita BRL USD EUR', () => {
    expect(normalizeAppCurrency('brl')).toBe('BRL');
    expect(normalizeAppCurrency('USD')).toBe('USD');
    expect(normalizeAppCurrency('eur')).toBe('EUR');
    expect(normalizeAppCurrency('mxn')).toBeNull();
  });
});

describe('resolveAppCurrency (IX2)', () => {
  it('cookie ganha do país', () => {
    expect(resolveAppCurrency({ cookie: 'EUR', country: 'US' })).toEqual({
      currency: 'EUR',
      source: 'cookie',
    });
  });

  it('país mapeia moeda (D6)', () => {
    expect(resolveAppCurrency({ country: 'BR' }).currency).toBe('BRL');
    expect(resolveAppCurrency({ country: 'ES' }).currency).toBe('EUR');
    expect(resolveAppCurrency({ country: 'MX' }).currency).toBe('USD');
    expect(resolveAppCurrency({ country: 'US' }).currency).toBe('USD');
  });

  it('sem país nem cookie cai em USD', () => {
    expect(resolveAppCurrency({})).toEqual({ currency: 'USD', source: 'default' });
  });

  it('query ganha do cookie', () => {
    expect(resolveAppCurrency({ query: 'BRL', cookie: 'USD' }).currency).toBe('BRL');
  });
});

describe('readCountryFromRequest', () => {
  it('lê CF-IPCountry e ignora XX', () => {
    expect(readCountryFromRequest({ 'cf-ipcountry': 'es' })).toBe('ES');
    expect(readCountryFromRequest({ 'cf-ipcountry': 'XX' })).toBeNull();
    expect(readCountryFromRequest({})).toBeNull();
  });
});
