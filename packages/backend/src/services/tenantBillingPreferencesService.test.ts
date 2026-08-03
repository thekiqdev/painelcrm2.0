import { describe, it, expect } from 'vitest';
import { resolveTenantBillingPreferences } from './tenantBillingPreferencesService.js';

describe('resolveTenantBillingPreferences — Sprint 5.1 weekly', () => {
  it('weekly null → source inherited_general', () => {
    const r = resolveTenantBillingPreferences({
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '09:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: null,
      recurring_invoice_generate_days_before_due: 7,
      recurring_invoice_generate_days_before_due_weekly: null,
    });
    expect(r.recurring_invoice_generate_days_before_due_weekly).toBeNull();
    expect(r.recurring_invoice_generate_days_before_due_weekly_source).toBe('inherited_general');
    expect(r.recurring_invoice_generate_days_before_due_effective).toBe(7);
  });

  it('weekly set → source tenant e valor clampado', () => {
    const r = resolveTenantBillingPreferences({
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '09:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: null,
      recurring_invoice_generate_days_before_due: 7,
      recurring_invoice_generate_days_before_due_weekly: 2,
    });
    expect(r.recurring_invoice_generate_days_before_due_weekly).toBe(2);
    expect(r.recurring_invoice_generate_days_before_due_weekly_source).toBe('tenant');
  });

  it('weekly 0 é valor explícito (não herda)', () => {
    const r = resolveTenantBillingPreferences({
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '09:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: null,
      recurring_invoice_generate_days_before_due: 7,
      recurring_invoice_generate_days_before_due_weekly: 0,
    });
    expect(r.recurring_invoice_generate_days_before_due_weekly).toBe(0);
    expect(r.recurring_invoice_generate_days_before_due_weekly_source).toBe('tenant');
  });
});
