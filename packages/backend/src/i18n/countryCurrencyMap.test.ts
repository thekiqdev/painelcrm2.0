import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CURRENCY_MAP_VERSION,
  EUROZONE_COUNTRY_CODES,
  currencyForCountry,
} from './countryCurrencyMap.js';

describe('currencyForCountry (IX0 / D6)', () => {
  it('versão do mapa fica estável para a IX2', () => {
    expect(COUNTRY_CURRENCY_MAP_VERSION).toBe(1);
    expect(EUROZONE_COUNTRY_CODES).toHaveLength(20);
  });

  it('Brasil é real', () => {
    expect(currencyForCountry('BR')).toBe('BRL');
    expect(currencyForCountry('br')).toBe('BRL');
  });

  it('zona do euro é euro, inclusive Espanha e Portugal', () => {
    expect(currencyForCountry('ES')).toBe('EUR');
    expect(currencyForCountry('PT')).toBe('EUR');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('gr')).toBe('EUR');
  });

  it('América hispânica e Estados Unidos caem em dólar', () => {
    expect(currencyForCountry('MX')).toBe('USD');
    expect(currencyForCountry('AR')).toBe('USD');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('país ausente ou inválido cai em dólar', () => {
    expect(currencyForCountry(null)).toBe('USD');
    expect(currencyForCountry(undefined)).toBe('USD');
    expect(currencyForCountry('')).toBe('USD');
    expect(currencyForCountry('BRA')).toBe('USD');
  });
});
