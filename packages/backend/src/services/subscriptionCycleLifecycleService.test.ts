import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock('./subscriptionCyclesWriteFlagService.js', () => ({
  isSubscriptionCyclesWriteEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

const resetJobMock = vi.fn();
const repairOpenJobMock = vi.fn();

vi.mock('./billingJobExecutionResetService.js', () => ({
  resetJobExecutionForReopenedCompetencies: (...args: unknown[]) => resetJobMock(...args),
  repairJobExecutionForOpenCycles: (...args: unknown[]) => repairOpenJobMock(...args),
}));

import {
  reopenCyclesAfterInvoiceRemoved,
  repairInvoicedCyclesWithoutInvoice,
  repairInvoicedCyclesWithoutInvoiceBatch,
} from './subscriptionCycleLifecycleService.js';

describe('subscriptionCycleLifecycleService Sprint 5.0-24C/24E', () => {
  beforeEach(() => {
    queryMock.mockReset();
    resetJobMock.mockReset();
    repairOpenJobMock.mockReset();
    resetJobMock.mockResolvedValue({ jobs_reset: 1, job_ids: ['job-1'] });
    repairOpenJobMock.mockResolvedValue({ jobs_reset: 0, job_ids: [] });
  });

  it('reopenCyclesAfterInvoiceRemoved sets pending and resets job execution', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'cycle-1', cycle_date: '2026-07-23', subscription_id: 'sub-1' }],
    });

    const result = await reopenCyclesAfterInvoiceRemoved('tenant-1', 'inv-1');

    expect(result.cycle_ids).toEqual(['cycle-1']);
    expect(result.cycle_dates).toEqual(['2026-07-23']);
    expect(result.jobs_reset).toBe(1);
    expect(resetJobMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        subscriptionId: 'sub-1',
        cycleDatesYmd: ['2026-07-23'],
      })
    );
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('invoice_id = $2::uuid');
  });

  it('repairInvoicedCyclesWithoutInvoice fixes invoiced without invoice_id and syncs jobs', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 'cycle-a', cycle_date: '2026-07-16', subscription_id: 'sub-1' },
        { id: 'cycle-b', cycle_date: '2026-07-23', subscription_id: 'sub-1' },
      ],
    });
    repairOpenJobMock.mockResolvedValueOnce({ jobs_reset: 1, job_ids: ['job-2'] });

    const result = await repairInvoicedCyclesWithoutInvoice('tenant-1', 'sub-1');

    expect(result.cycles_reopened).toBe(2);
    expect(result.jobs_reset).toBe(2);
    expect(repairOpenJobMock).toHaveBeenCalled();
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("status = 'invoiced'");
    expect(sql).toContain('invoice_id IS NULL');
    expect(sql).toContain("status = 'pending'");
  });

  it('repairInvoicedCyclesWithoutInvoice scopes to cycle_id when provided', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'cycle-a', cycle_date: '2026-07-16', subscription_id: 'sub-1' }],
    });

    await repairInvoicedCyclesWithoutInvoice('tenant-1', 'sub-1', { cycleId: 'cycle-a' });

    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('AND id = $4::uuid');
  });

  it('repairInvoicedCyclesWithoutInvoiceBatch uses CTE limit and resets jobs per tenant', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'cycle-a',
          cycle_date: '2026-07-16',
          subscription_id: 'sub-1',
          tenant_id: 'tenant-1',
        },
      ],
    });

    const result = await repairInvoicedCyclesWithoutInvoiceBatch({ tenantId: 'tenant-1', limit: 100 });

    expect(result.jobs_reset).toBe(1);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain('WITH targets AS');
    expect(sql).toContain('invoice_id IS NULL');
    expect(sql).toContain('sc.tenant_id::text');
  });
});
