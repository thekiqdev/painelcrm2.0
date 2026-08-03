import { describe, expect, it } from 'vitest';
import {
  effectiveDaysBeforeFromTenantBilling,
  effectiveRecurringGenerateDaysBeforeDue,
  resolveTenantGenerateDaysBeforeDueRaw,
  computeRecurringGenerationDateYmd,
} from './recurringGenerationPreview';

describe('recurringGenerationPreview — Sprint 5.3 SSOT', () => {
  it('weekly + weekly=2 + geral=7 → efetivo 2 e geração due−2', () => {
    const days = effectiveRecurringGenerateDaysBeforeDue({
      general: 7,
      weekly: 2,
      billingInterval: 'weekly',
    });
    expect(days).toBe(2);
    expect(computeRecurringGenerationDateYmd('2026-07-14', days)).toBe('2026-07-12');
  });

  it('weekly + weekly=null + geral=7 → efetivo 6 (cap)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: null,
        billingInterval: 'weekly',
      })
    ).toBe(6);
    expect(
      resolveTenantGenerateDaysBeforeDueRaw({
        general: 7,
        weekly: null,
        billingInterval: 'weekly',
      })
    ).toEqual({ tenantRaw: 7, source: 'general' });
  });

  it('monthly + weekly=2 + geral=7 → efetivo 7 (ignora weekly)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: 2,
        billingInterval: 'monthly',
      })
    ).toBe(7);
  });

  it('weekly + weekly=10 → efetivo 6 (cap)', () => {
    expect(
      effectiveRecurringGenerateDaysBeforeDue({
        general: 7,
        weekly: 10,
        billingInterval: 'weekly',
      })
    ).toBe(6);
  });

  it('effectiveDaysBeforeFromTenantBilling usa prefs + intervalo', () => {
    expect(
      effectiveDaysBeforeFromTenantBilling(
        {
          recurring_invoice_generate_days_before_due: 7,
          recurring_invoice_generate_days_before_due_weekly: 2,
        },
        'weekly'
      )
    ).toBe(2);
    expect(
      effectiveDaysBeforeFromTenantBilling(
        {
          recurring_invoice_generate_days_before_due: 7,
          recurring_invoice_generate_days_before_due_weekly: 2,
        },
        'monthly'
      )
    ).toBe(7);
  });
});
