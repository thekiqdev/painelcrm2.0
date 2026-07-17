import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getOperationsDashboardHttpCacheStats,
  getOperationsDashboardSingleFlight,
  invalidateOperationsDashboardHttpCache,
  resetOperationsDashboardHttpCache,
} from './operationsDashboardHttpCache';

describe('getOperationsDashboardSingleFlight (TF8 E2)', () => {
  beforeEach(() => {
    resetOperationsDashboardHttpCache();
  });

  it('collapses parallel callers into one HTTP fetch', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { summary: { open: 1 } };
    });

    const key = 't1:u1';
    const [a, b, c] = await Promise.all([
      getOperationsDashboardSingleFlight(key, fetchFn),
      getOperationsDashboardSingleFlight(key, fetchFn),
      getOperationsDashboardSingleFlight(key, fetchFn),
    ]);

    expect(calls).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ summary: { open: 1 } });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const stats = getOperationsDashboardHttpCacheStats();
    expect(stats.httpExecuted).toBe(1);
    expect(stats.inFlightJoins).toBe(2);
  });

  it('serves TTL soft cache on subsequent calls', async () => {
    const fetchFn = vi.fn(async () => ({ summary: { open: 2 } }));
    const key = 't1:u1';
    await getOperationsDashboardSingleFlight(key, fetchFn);
    await getOperationsDashboardSingleFlight(key, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(getOperationsDashboardHttpCacheStats().httpAvoided).toBeGreaterThanOrEqual(1);
  });

  it('isolates cache by tenant:user key', async () => {
    const fetchA = vi.fn(async () => ({ id: 'a' }));
    const fetchB = vi.fn(async () => ({ id: 'b' }));
    const a = await getOperationsDashboardSingleFlight('t1:u1', fetchA);
    const b = await getOperationsDashboardSingleFlight('t1:u2', fetchB);
    expect(a).toEqual({ id: 'a' });
    expect(b).toEqual({ id: 'b' });
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('refetches after invalidate or force', async () => {
    const fetchFn = vi.fn(async () => ({ n: fetchFn.mock.calls.length }));
    const key = 't1:u1';
    await getOperationsDashboardSingleFlight(key, fetchFn);
    invalidateOperationsDashboardHttpCache(key);
    await getOperationsDashboardSingleFlight(key, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await getOperationsDashboardSingleFlight(key, fetchFn, { force: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
