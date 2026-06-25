import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { ensureSubscriptionsWeeklyBillingInterval } from './ensureSubscriptionsWeeklyBillingInterval.js';

function mockPool(sequence: { ok: boolean }[]): Pool {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const row = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      return { rows: [{ ok: row?.ok ?? false }], rowCount: 1 };
    }),
  } as unknown as Pool;
}

describe('ensureSubscriptionsWeeklyBillingInterval', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('não executa DDL quando weekly já está no constraint', async () => {
    const pool = mockPool([{ ok: true }]);
    await ensureSubscriptionsWeeklyBillingInterval(pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('executa DDL quando weekly ausente e confirma depois', async () => {
    const pool = mockPool([{ ok: false }, { ok: true }]);
    await ensureSubscriptionsWeeklyBillingInterval(pool);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
