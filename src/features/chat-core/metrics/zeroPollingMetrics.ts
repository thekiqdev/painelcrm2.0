/**
 * MB-049 — métricas Phase 9 (zero polling). Apenas contadores em memória.
 */

export type ZeroPollingMetricsSnapshot = {
  polling_removed_total: number;
  socket_updates_total: number;
  manual_refresh_total: number;
  webhook_updates_total: number;
  automatic_http_refresh_total: number;
  runtime_cache_hits: number;
  runtime_cache_miss: number;
};

const state: ZeroPollingMetricsSnapshot = {
  polling_removed_total: 0,
  socket_updates_total: 0,
  manual_refresh_total: 0,
  webhook_updates_total: 0,
  automatic_http_refresh_total: 0,
  runtime_cache_hits: 0,
  runtime_cache_miss: 0,
};

export function recordPollingRemoved(by = 1): void {
  state.polling_removed_total += by;
}

export function recordSocketUpdate(by = 1): void {
  state.socket_updates_total += by;
}

export function recordManualRefresh(by = 1): void {
  state.manual_refresh_total += by;
}

export function recordWebhookUpdate(by = 1): void {
  state.webhook_updates_total += by;
}

/** Deve permanecer 0 em operação normal pós-Phase 9. */
export function recordAutomaticHttpRefresh(by = 1): void {
  state.automatic_http_refresh_total += by;
}

export function recordRuntimeCacheHit(by = 1): void {
  state.runtime_cache_hits += by;
}

export function recordRuntimeCacheMiss(by = 1): void {
  state.runtime_cache_miss += by;
}

export function getZeroPollingMetricsSnapshot(): Readonly<ZeroPollingMetricsSnapshot> {
  return { ...state };
}

export function resetZeroPollingMetricsForTests(): void {
  state.polling_removed_total = 0;
  state.socket_updates_total = 0;
  state.manual_refresh_total = 0;
  state.webhook_updates_total = 0;
  state.automatic_http_refresh_total = 0;
  state.runtime_cache_hits = 0;
  state.runtime_cache_miss = 0;
}
