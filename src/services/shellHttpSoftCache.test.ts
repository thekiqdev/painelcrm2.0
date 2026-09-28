import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createSoftHttpCache } from './shellHttpSoftCache';
import {
  resetShellPollHttpCaches,
  ticketMenuCountCache,
  SHELL_BADGE_TTL_MS,
} from './shellPollHttpCaches';

describe('createSoftHttpCache (TF8 E4)', () => {
  beforeEach(() => {
    resetShellPollHttpCaches();
  });

  it('collapses parallel callers into one HTTP', async () => {
    const cache = createSoftHttpCache<number>({ ttlMs: 20_000 });
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 7;
    });

    const [a, b, c] = await Promise.all([
      cache.get('k', fetchFn),
      cache.get('k', fetchFn),
      cache.get('k', fetchFn),
    ]);

    expect(calls).toBe(1);
    expect(a).toBe(7);
    expect(b).toBe(7);
    expect(c).toBe(7);
    expect(cache.getStats().inFlightJoins).toBe(2);
  });

  it('serves TTL cache and allows 0 as valid value', async () => {
    const cache = createSoftHttpCache<number>({ ttlMs: SHELL_BADGE_TTL_MS });
    const fetchFn = vi.fn(async () => 0);
    await cache.get('k', fetchFn);
    await cache.get('k', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cache.peek('k')).toBe(0);
  });

  it('ticketMenuCountCache is shared singleton', async () => {
    const fetchFn = vi.fn(async () => 3);
    await ticketMenuCountCache.get('t:u:tickets-menu-count', fetchFn);
    await ticketMenuCountCache.get('t:u:tickets-menu-count', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
