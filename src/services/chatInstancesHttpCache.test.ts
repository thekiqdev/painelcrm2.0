import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getChatInstancesHttpCacheStats,
  listInstancesSingleFlight,
  invalidateChatInstancesHttpCache,
  resetChatInstancesHttpCache,
} from './chatInstancesHttpCache';

describe('listInstancesSingleFlight (MB-008)', () => {
  beforeEach(() => {
    resetChatInstancesHttpCache();
  });

  it('collapses parallel callers into one HTTP fetch', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return [{ id: 'a' }];
    });

    const [a, b, c] = await Promise.all([
      listInstancesSingleFlight(fetchFn),
      listInstancesSingleFlight(fetchFn),
      listInstancesSingleFlight(fetchFn),
    ]);

    expect(calls).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual([{ id: 'a' }]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const stats = getChatInstancesHttpCacheStats();
    expect(stats.httpExecuted).toBe(1);
    expect(stats.inFlightJoins).toBe(2);
  });

  it('serves TTL soft cache on subsequent calls', async () => {
    const fetchFn = vi.fn(async () => [{ id: 'b' }]);
    await listInstancesSingleFlight(fetchFn);
    await listInstancesSingleFlight(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(getChatInstancesHttpCacheStats().httpAvoided).toBeGreaterThanOrEqual(1);
  });

  it('refetches after invalidate', async () => {
    const fetchFn = vi.fn(async () => [{ id: 'c' }]);
    await listInstancesSingleFlight(fetchFn);
    invalidateChatInstancesHttpCache();
    await listInstancesSingleFlight(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('force bypasses cache', async () => {
    const fetchFn = vi.fn(async () => [{ id: 'd' }]);
    await listInstancesSingleFlight(fetchFn);
    await listInstancesSingleFlight(fetchFn, { force: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
