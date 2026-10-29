import { describe, expect, it } from 'vitest';
import {
  normalizeLocalizationInput,
  resolveTenantLocalization,
} from './tenantLocalizationService.js';

describe('tenantLocalizationService', () => {
  it('resolve defaults to all currencies and BRL', () => {
    const r = resolveTenantLocalization(null);
    expect(r.available_currencies).toEqual(['BRL', 'USD', 'EUR']);
    expect(r.enabled_currencies).toEqual(['BRL', 'USD', 'EUR']);
    expect(r.default_currency).toBe('BRL');
  });

  it('keeps default inside enabled set', () => {
    const r = resolveTenantLocalization({
      default_currency: 'USD',
      enabled_currencies: ['EUR', 'USD'],
    });
    expect(r.default_currency).toBe('USD');
    expect(r.enabled_currencies).toEqual(['EUR', 'USD']);
  });

  it('falls back when default is disabled', () => {
    const r = resolveTenantLocalization({
      default_currency: 'USD',
      enabled_currencies: ['BRL'],
    });
    expect(r.default_currency).toBe('BRL');
  });

  it('rejects empty enabled list', () => {
    const n = normalizeLocalizationInput({ enabled_currencies: [], default_currency: 'BRL' });
    expect(n.ok).toBe(false);
  });

  it('rejects default outside enabled', () => {
    const n = normalizeLocalizationInput({
      enabled_currencies: ['BRL'],
      default_currency: 'EUR',
    });
    expect(n.ok).toBe(false);
  });

  it('accepts valid payload', () => {
    const n = normalizeLocalizationInput({
      enabled_currencies: ['brl', 'EUR'],
      default_currency: 'eur',
    });
    expect(n).toEqual({
      ok: true,
      value: { enabled_currencies: ['BRL', 'EUR'], default_currency: 'EUR' },
    });
  });
});
