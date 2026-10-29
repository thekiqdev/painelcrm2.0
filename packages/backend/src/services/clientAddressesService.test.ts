import { describe, expect, it } from 'vitest';
import {
  formatPostalCodeDisplay,
  normalizePostalCodeDigits,
} from './clientAddressesService.js';

describe('clientAddressesService CEP helpers', () => {
  it('normalizePostalCodeDigits remove máscara', () => {
    expect(normalizePostalCodeDigits('05416-012')).toBe('05416012');
    expect(normalizePostalCodeDigits(' 05.416.012 ')).toBe('05416012');
    expect(normalizePostalCodeDigits('')).toBeNull();
    expect(normalizePostalCodeDigits(null)).toBeNull();
  });

  it('formatPostalCodeDisplay aplica máscara BR', () => {
    expect(formatPostalCodeDisplay('05416012')).toBe('05416-012');
    expect(formatPostalCodeDisplay('05416-012')).toBe('05416-012');
    expect(formatPostalCodeDisplay('123')).toBe('123');
    expect(formatPostalCodeDisplay(null)).toBeNull();
  });
});
