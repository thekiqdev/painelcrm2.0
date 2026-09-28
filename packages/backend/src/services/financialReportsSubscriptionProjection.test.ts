import { describe, it, expect } from 'vitest';
import {
  normalizeCrmSubscriptionAmountToMonthlyCents,
  crmSubscriptionArrFromMonthlyCents,
} from './financialReportsSubscriptionProjection.js';

describe('normalizeCrmSubscriptionAmountToMonthlyCents', () => {
  it('weekly: normaliza com × 52/12', () => {
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(1200, 'weekly')).toBe(Math.floor((1200 * 52) / 12));
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(1200, 'weekly')).toBe(5200);
  });

  it('monthly: mantém valor do ciclo', () => {
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(9900, 'monthly')).toBe(9900);
  });

  it('quarterly, semi_annual e yearly: normalizam para MRR mensal', () => {
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(30000, 'quarterly')).toBe(10000);
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(60000, 'semi_annual')).toBe(10000);
    expect(normalizeCrmSubscriptionAmountToMonthlyCents(120000, 'yearly')).toBe(10000);
  });
});

describe('crmSubscriptionArrFromMonthlyCents', () => {
  it('ARR = MRR × 12', () => {
    expect(crmSubscriptionArrFromMonthlyCents(5200)).toBe(62400);
  });
});
