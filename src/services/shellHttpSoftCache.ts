/**
 * TF8 E4 — Single-flight + soft TTL genérico para polls do shell.
 * Keyed por string (tenant:user:resource); remount / Strict Mode / multi-caller → 1 HTTP.
 */

import {
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
} from '@/features/chat-core/metrics/zeroPollingMetrics';

export type SoftHttpCacheStats = {
  httpExecuted: number;
  httpAvoided: number;
  inFlightJoins: number;
};

type Entry<T> = {
  data: T | null;
  fetchedAt: number;
  inFlight: Promise<T> | null;
};

export type SoftHttpCache<T> = {
  get(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    options?: { force?: boolean },
  ): Promise<T>;
  invalidate(cacheKey?: string): void;
  reset(): void;
  getStats(): Readonly<SoftHttpCacheStats>;
  peek(cacheKey: string): T | null;
};

export function createSoftHttpCache<T>(opts: { ttlMs: number }): SoftHttpCache<T> {
  const ttlMs = Math.max(0, opts.ttlMs);
  const entries = new Map<string, Entry<T>>();
  const stats: SoftHttpCacheStats = {
    httpExecuted: 0,
    httpAvoided: 0,
    inFlightJoins: 0,
  };

  const getOrCreate = (cacheKey: string): Entry<T> => {
    let entry = entries.get(cacheKey);
    if (!entry) {
      entry = { data: null, fetchedAt: 0, inFlight: null };
      entries.set(cacheKey, entry);
    }
    return entry;
  };

  const isFresh = (entry: Entry<T>): boolean => {
    if (entry.fetchedAt <= 0) return false;
    if (entry.data === null || entry.data === undefined) return false;
    return Date.now() - entry.fetchedAt < ttlMs;
  };

  return {
    async get(cacheKey, fetchFn, options) {
      const entry = getOrCreate(cacheKey);

      if (!options?.force && isFresh(entry)) {
        stats.httpAvoided += 1;
        recordRuntimeCacheHit();
        return entry.data as T;
      }

      if (entry.inFlight) {
        stats.inFlightJoins += 1;
        stats.httpAvoided += 1;
        return entry.inFlight;
      }

      entry.inFlight = (async () => {
        try {
          stats.httpExecuted += 1;
          recordRuntimeCacheMiss();
          const data = await fetchFn();
          entry.data = data;
          entry.fetchedAt = Date.now();
          return data;
        } finally {
          entry.inFlight = null;
        }
      })();

      return entry.inFlight;
    },

    invalidate(cacheKey) {
      if (cacheKey) {
        const entry = entries.get(cacheKey);
        if (entry) {
          entry.data = null;
          entry.fetchedAt = 0;
        }
        return;
      }
      for (const entry of entries.values()) {
        entry.data = null;
        entry.fetchedAt = 0;
      }
    },

    reset() {
      entries.clear();
      stats.httpExecuted = 0;
      stats.httpAvoided = 0;
      stats.inFlightJoins = 0;
    },

    getStats() {
      return { ...stats };
    },

    peek(cacheKey) {
      const entry = entries.get(cacheKey);
      if (!entry || !isFresh(entry)) return null;
      return entry.data;
    },
  };
}
