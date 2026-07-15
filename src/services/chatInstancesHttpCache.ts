/**
 * MB-008 — Single-flight + soft TTL para GET /api/chat/instances.
 * Camada HTTP (services) — compartilhada por Chat / Floating / Unread / legado.
 * Não altera endpoint, payload nem chat-core.
 */

import {
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
} from '@/features/chat-core/metrics/zeroPollingMetrics';

export type InstancesHttpCacheStats = {
  httpExecuted: number;
  httpAvoided: number;
  inFlightJoins: number;
};

/** Phase 9 — cache de sessão: só invalida em mutation/logout (TTL efetivamente sessão). */
const INSTANCES_TTL_MS = 24 * 60 * 60_000;

type CacheState<T> = {
  data: T[] | null;
  fetchedAt: number;
  inFlight: Promise<T[]> | null;
};

const state: CacheState<unknown> = {
  data: null,
  fetchedAt: 0,
  inFlight: null,
};

const stats: InstancesHttpCacheStats = {
  httpExecuted: 0,
  httpAvoided: 0,
  inFlightJoins: 0,
};

function isFresh(): boolean {
  if (!state.data || state.data.length === 0) return false;
  return Date.now() - state.fetchedAt < INSTANCES_TTL_MS;
}

/** Invalida cache (mutations de instância / logout). */
export function invalidateChatInstancesHttpCache(): void {
  state.data = null;
  state.fetchedAt = 0;
  // Não cancela inFlight em andamento — próximo caller após resolve verá cache fresh ou refetch se invalidado no meio.
}

export function resetChatInstancesHttpCacheStats(): void {
  stats.httpExecuted = 0;
  stats.httpAvoided = 0;
  stats.inFlightJoins = 0;
}

export function getChatInstancesHttpCacheStats(): Readonly<InstancesHttpCacheStats> {
  return { ...stats };
}

/** Reset completo (testes / logout). */
export function resetChatInstancesHttpCache(): void {
  invalidateChatInstancesHttpCache();
  state.inFlight = null;
  resetChatInstancesHttpCacheStats();
}

/**
 * Deduplica GET instances: join in-flight + TTL soft cache.
 */
export async function listInstancesSingleFlight<T>(
  fetchFn: () => Promise<T[]>,
  options?: { force?: boolean },
): Promise<T[]> {
  if (!options?.force && isFresh()) {
    stats.httpAvoided += 1;
    recordRuntimeCacheHit();
    return state.data as T[];
  }

  if (state.inFlight) {
    stats.inFlightJoins += 1;
    stats.httpAvoided += 1;
    return state.inFlight as Promise<T[]>;
  }

  state.inFlight = (async () => {
    try {
      stats.httpExecuted += 1;
      recordRuntimeCacheMiss();
      const data = await fetchFn();
      state.data = data as unknown[];
      state.fetchedAt = Date.now();
      return data;
    } finally {
      state.inFlight = null;
    }
  })();

  return state.inFlight as Promise<T[]>;
}
