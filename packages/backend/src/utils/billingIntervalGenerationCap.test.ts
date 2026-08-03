import { describe, it, expect } from 'vitest';
import {
  effectiveRecurringGenerateDaysBeforeDue,
  isGenerateDaysBeforeCappedForInterval,
  isGenerateDaysBeforeCappedForTenant,
  maxRecurringGenerateDaysBeforeForInterval,
  resolveTenantGenerateDaysBeforeDueRaw,
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

describe('resolveTenantGenerateDaysBeforeDue — Sprint 5.1', () => {
  it('weekly + weekly=2 + geral=7 → efetivo 2', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: 2,
        billingInterval: 'weekly',
      }),
    ).toBe(2);
    expect(
      resolveTenantGenerateDaysBeforeDueRaw({ general: 7, weekly: 2, billingInterval: 'weekly' }),
    ).toEqual({ tenantRaw: 2, source: 'weekly' });
  });

  it('weekly + weekly=NULL + geral=7 → efetivo 6 (cap, herda geral)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: null,
        billingInterval: 'weekly',
      }),
    ).toBe(6);
    expect(
      resolveTenantGenerateDaysBeforeDueRaw({ general: 7, weekly: null, billingInterval: 'weekly' }),
    ).toEqual({ tenantRaw: 7, source: 'general' });
  });

  it('monthly + weekly=2 + geral=7 → efetivo 7 (ignora weekly)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: 2,
        billingInterval: 'monthly',
      }),
    ).toBe(7);
  });

  it('weekly + weekly=10 → efetivo 6 (cap)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 0,
        weekly: 10,
        billingInterval: 'weekly',
      }),
    ).toBe(6);
    expect(
      isGenerateDaysBeforeCappedForTenant({ general: 0, weekly: 10, billingInterval: 'weekly' }),
    ).toBe(true);
  });

  it('weekly + weekly=0 → efetivo 0 (não herda)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: 0,
        billingInterval: 'weekly',
      }),
    ).toBe(0);
    expect(
      resolveTenantGenerateDaysBeforeDueRaw({ general: 7, weekly: 0, billingInterval: 'weekly' }),
    ).toEqual({ tenantRaw: 0, source: 'weekly' });
  });
});
