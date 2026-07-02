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

import { repairRecoverableSubscriptionCycles, repairCycle } from './subscriptionCycleRepairService.js';

describe('subscriptionCycleRepairService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('repairRecoverableSubscriptionCycles updates failed cycles and jobs', async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ cycle_date: '2026-07-14' }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await repairRecoverableSubscriptionCycles('t1', 'sub-1');
    expect(result.cycles_repaired).toBe(1);
    expect(result.jobs_repaired).toBe(1);
    expect(result.repaired_cycle_dates).toContain('2026-07-14');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('repairRecoverableSubscriptionCycles no-op when nothing to repair', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 });

    const result = await repairRecoverableSubscriptionCycles('t1', 'sub-1');
    expect(result.cycles_repaired).toBe(0);
    expect(result.jobs_repaired).toBe(0);
  });

  it('repairCycle returns true when subscription has recoverable failures', async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ cycle_date: '2099-12-31' }],
      })
      .mockResolvedValueOnce({ rowCount: 0 });

    const ok = await repairCycle('t1', 'sub-1', '2099-12-31');
    expect(ok).toBe(true);
  });

  it('repairCycle returns false for past cycle date', async () => {
    const ok = await repairCycle('t1', 'sub-1', '2020-01-01');
    expect(ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
