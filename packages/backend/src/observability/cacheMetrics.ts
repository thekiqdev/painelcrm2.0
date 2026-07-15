import { getObservabilityConfig, shouldSampleObservation } from './config.js';
import { ensureCounter, incCounter } from './registry.js';

let defs = false;

export function registerCacheMetricDefs(): void {
  if (defs) return;
  defs = true;
  ensureCounter('cache_hit_total', 'Cache hits');
  ensureCounter('cache_miss_total', 'Cache misses');
  ensureCounter('cache_invalidate_total', 'Cache invalidations');
  ensureCounter('cache_warm_total', 'Cache warm operations');
  ensureCounter('cache_cold_total', 'Cache cold starts');
}

export type CacheMetricKind = 'hit' | 'miss' | 'invalidate' | 'warm' | 'cold';

export function recordCacheEvent(kind: CacheMetricKind, cache = 'default'): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled || !shouldSampleObservation(cfg.sampleRate)) return;
  registerCacheMetricDefs();
  const name =
    kind === 'hit'
      ? 'cache_hit_total'
      : kind === 'miss'
        ? 'cache_miss_total'
        : kind === 'invalidate'
          ? 'cache_invalidate_total'
          : kind === 'warm'
            ? 'cache_warm_total'
            : 'cache_cold_total';
  incCounter(name, { cache });
}
