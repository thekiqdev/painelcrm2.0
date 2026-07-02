import { describe, it, expect } from 'vitest';
import {
  formatBillingPlanNumber,
  parseBillingPlanNumber,
  isValidBillingPlanNumber,
  BillingPlanNumberGenerator,
} from './billingPlanNumberGenerator.js';

describe('BillingPlanNumberGenerator', () => {
  it('formata BP-00000001', () => {
    expect(formatBillingPlanNumber(1)).toBe('BP-00000001');
    expect(formatBillingPlanNumber(12345678)).toBe('BP-12345678');
  });

  it('parse e validate', () => {
    expect(parseBillingPlanNumber('BP-00000042')).toBe(42);
    expect(isValidBillingPlanNumber('BP-00000042')).toBe(true);
    expect(isValidBillingPlanNumber('INVALID')).toBe(false);
  });

  it('rejeita sequence inválida', () => {
    expect(() => formatBillingPlanNumber(0)).toThrow('billing_plan_number_invalid_sequence');
  });

  it('classe generator format/parse', () => {
    const gen = new BillingPlanNumberGenerator();
    expect(gen.format(5)).toBe('BP-00000005');
    expect(gen.validate('BP-00000005')).toBe(true);
  });
});
