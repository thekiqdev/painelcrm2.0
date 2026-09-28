import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('../subscriptionCycleMaterializer.js', () => ({
  ensureSubscriptionCycle: vi.fn(async () => ({
    cycleId: 'cyc-1',
    cycleDate: '2026-07-29',
    status: 'pending',
    created: true,
    reactivated: false,
  })),
  updateSubscriptionCycleLifecycle: vi.fn(async () => undefined),
}));

import { pool } from '../../utils/db.js';
import {
  ensureSubscriptionCycle,
  updateSubscriptionCycleLifecycle,
} from '../subscriptionCycleMaterializer.js';
import {
  attachCustomerInvoiceToSubscriptionCycle,
  repairOrphanCustomerInvoicesWithoutCycles,
  seedNextPendingCycleIfEligible,
} from './crmSubscriptionInvoiceCycleLink.js';

describe('crmSubscriptionInvoiceCycleLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attachCustomerInvoiceToSubscriptionCycle materializa e marca invoiced', async () => {
    const r = await attachCustomerInvoiceToSubscriptionCycle({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
      invoiceId: 'inv-1',
      cycleDateYmd: '2026-07-29',
      source: 'crm_first_invoice',
    });
    expect(r).toEqual({ ok: true, cycleId: 'cyc-1' });
    expect(ensureSubscriptionCycle).toHaveBeenCalled();
    expect(updateSubscriptionCycleLifecycle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'invoiced',
        invoiceId: 'inv-1',
        cycleDate: '2026-07-29',
      })
    );
  });

  it('repairOrphanCustomerInvoicesWithoutCycles liga faturas órfãs e tenta seed C+1', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: 'inv-old', period_start: '2026-06-01', due_date: '2026-06-01' }],
      } as never)
      // seedNextPendingCycleIfEligible queries
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'active',
            next_billing_date: '2026-07-01',
            cycles_unlimited: true,
            max_cycles: null,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ n: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const r = await repairOrphanCustomerInvoicesWithoutCycles({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r.repaired).toBe(1);
    expect(updateSubscriptionCycleLifecycle).toHaveBeenCalled();
    expect(ensureSubscriptionCycle).toHaveBeenCalled();
  });

  it('seedNextPendingCycleIfEligible materializa next_billing_date quando há margem', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'active',
            next_billing_date: '2026-08-29',
            cycles_unlimited: true,
            max_cycles: null,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ n: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const r = await seedNextPendingCycleIfEligible({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
      source: 'crm_first_invoice',
    });
    expect(r).toEqual({
      ok: true,
      seeded: true,
      cycleDate: '2026-08-29',
      detail: 'seeded',
    });
    expect(ensureSubscriptionCycle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cycleDateYmd: '2026-08-29',
        source: 'crm_first_invoice',
      })
    );
  });

  it('seedNextPendingCycleIfEligible não seeda quando max_cycles esgotado', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'active',
            next_billing_date: '2026-08-29',
            cycles_unlimited: false,
            max_cycles: 1,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ n: 1 }] } as never);

    const r = await seedNextPendingCycleIfEligible({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r.seeded).toBe(false);
    expect(r.detail).toBe('max_cycles_exhausted');
    expect(ensureSubscriptionCycle).not.toHaveBeenCalled();
  });

  it('seedNextPendingCycleIfEligible é no-op se pending já existe', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'active',
            next_billing_date: '2026-08-29',
            cycles_unlimited: true,
            max_cycles: null,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ n: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never);

    const r = await seedNextPendingCycleIfEligible({
      tenantId: 'ten-1',
      subscriptionId: 'sub-1',
    });
    expect(r.seeded).toBe(false);
    expect(r.detail).toBe('already_pending');
    expect(ensureSubscriptionCycle).not.toHaveBeenCalled();
  });
});
