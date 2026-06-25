import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCrmRenewalPreviousInvoice } from './crmRenewalCustomerResolver.js';
import * as customerInvoiceService from './customerInvoiceService.js';

describe('crmRenewalCustomerResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('weekly: ciclo anterior é -7 dias', () => {
    const db = { query: vi.fn() };
    vi.spyOn(customerInvoiceService, 'findCustomerInvoiceBySubscriptionAndPeriod').mockImplementation(
      async (_subId, periodStart) => {
        if (periodStart === '2026-06-17') {
          return {
            id: 'inv-1',
            period_start: '2026-06-17',
            due_date: '2026-06-17',
          } as Awaited<ReturnType<typeof customerInvoiceService.findCustomerInvoiceBySubscriptionAndPeriod>>;
        }
        return null;
      }
    );

    return resolveCrmRenewalPreviousInvoice(db, {
      subscriptionId: 'sub-1',
      cyclePeriodStartYmd: '2026-06-24',
      subscriptionCurrentPeriodStart: '2026-06-10',
      billingInterval: 'weekly',
    }).then((r) => {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.resolved_via).toBe('computed_previous_cycle');
      expect(r.lookup_period_start).toBe('2026-06-17');
    });
  });

  it('falha quando current_period_start ausente', async () => {
    const db = { query: vi.fn() };
    const r = await resolveCrmRenewalPreviousInvoice(db, {
      subscriptionId: 'sub-1',
      cyclePeriodStartYmd: '2026-06-24',
      subscriptionCurrentPeriodStart: null,
      billingInterval: 'weekly',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('missing_current_period_start');
  });

  it('fallback: última fatura antes do ciclo', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'inv-latest',
            period_start: '2026-05-24',
            due_date: '2026-05-24',
          },
        ],
      }),
    };
    vi.spyOn(customerInvoiceService, 'findCustomerInvoiceBySubscriptionAndPeriod').mockResolvedValue(null);

    const r = await resolveCrmRenewalPreviousInvoice(db, {
      subscriptionId: 'sub-1',
      cyclePeriodStartYmd: '2026-06-24',
      subscriptionCurrentPeriodStart: '2026-06-01',
      billingInterval: 'monthly',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolved_via).toBe('latest_before_cycle');
    expect(r.lookup_period_start).toBe('2026-05-24');
  });
});
