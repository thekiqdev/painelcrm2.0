/**
 * TF8 E2 — Single-flight + soft TTL para GET /api/chat/operations-dashboard.
 * Keyed por tenantId:userId — Chat / OperationalPanel / Settings compartilham o mesmo voo.
 */

import {
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
} from '@/features/chat-core/metrics/zeroPollingMetrics';

export type OperationsDashboardHttpCacheStats = {
  httpExecuted: number;
  httpAvoided: number;
  inFlightJoins: number;
};

/** Soft stale: remount / multi-caller em ~60s não reabre HTTP. */
export const OPERATIONS_DASHBOARD_TTL_MS = 60_000;

type Entry<T> = {
  data: T | null;
  fetchedAt: number;
  inFlight: Promise<T> | null;
};

const entries = new Map<string, Entry<unknown>>();

const stats: OperationsDashboardHttpCacheStats = {
  httpExecuted: 0,
  httpAvoided: 0,
  inFlightJoins: 0,
};

function getOrCreateEntry(cacheKey: string): Entry<unknown> {
  let entry = entries.get(cacheKey);
  if (!entry) {
    entry = { data: null, fetchedAt: 0, inFlight: null };
    entries.set(cacheKey, entry);
  }
  return entry;
}

function isFresh(entry: Entry<unknown>): boolean {
  if (!entry.data) return false;
  return Date.now() - entry.fetchedAt < OPERATIONS_DASHBOARD_TTL_MS;
}

export function invalidateOperationsDashboardHttpCache(cacheKey?: string): void {
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
}

export function resetOperationsDashboardHttpCacheStats(): void {
  stats.httpExecuted = 0;
  stats.httpAvoided = 0;
  stats.inFlightJoins = 0;
}

export function getOperationsDashboardHttpCacheStats(): Readonly<OperationsDashboardHttpCacheStats> {
  return { ...stats };
}

/** Reset completo (testes / logout). */
export function resetOperationsDashboardHttpCache(): void {
  entries.clear();
  resetOperationsDashboardHttpCacheStats();
}

/**
 * Deduplica GET operations-dashboard: join in-flight + TTL soft por chave de sessão.
 */
export async function getOperationsDashboardSingleFlight<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  options?: { force?: boolean },
): Promise<T> {
  const entry = getOrCreateEntry(cacheKey);

  if (!options?.force && isFresh(entry)) {
    stats.httpAvoided += 1;
    recordRuntimeCacheHit();
    return entry.data as T;
  }

  if (entry.inFlight) {
    stats.inFlightJoins += 1;
    stats.httpAvoided += 1;
    return entry.inFlight as Promise<T>;
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

  return entry.inFlight as Promise<T>;
}
