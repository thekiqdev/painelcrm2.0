import { describe, it, expect } from 'vitest';
import {
  effectiveRecurringGenerateDaysBeforeDue,
  isGenerateDaysBeforeCappedForInterval,
  maxRecurringGenerateDaysBeforeForInterval,
} from './billingIntervalGenerationCap.js';

describe('billingIntervalGenerationCap', () => {
  it('semanal: cap máximo 6 dias', () => {
    expect(maxRecurringGenerateDaysBeforeForInterval('weekly')).toBe(6);
    expect(effectiveRecurringGenerateDaysBeforeDue(7, 'weekly')).toBe(6);
    expect(effectiveRecurringGenerateDaysBeforeDue(3, 'weekly')).toBe(3);
    expect(isGenerateDaysBeforeCappedForInterval(7, 'weekly')).toBe(true);
  });

  it('mensal: cap 30 dias', () => {
    expect(maxRecurringGenerateDaysBeforeForInterval('monthly')).toBe(30);
    expect(effectiveRecurringGenerateDaysBeforeDue(7, 'monthly')).toBe(7);
    expect(effectiveRecurringGenerateDaysBeforeDue(45, 'monthly')).toBe(30);
  });

  it('anual: respeita limite global de 60 dias do tenant', () => {
    expect(effectiveRecurringGenerateDaysBeforeDue(60, 'yearly')).toBe(60);
    expect(effectiveRecurringGenerateDaysBeforeDue(400, 'yearly')).toBe(60);
  });

  it('intervalo desconhecido usa fallback mensal', () => {
    expect(effectiveRecurringGenerateDaysBeforeDue(31, 'biweekly')).toBe(30);
  });
});
