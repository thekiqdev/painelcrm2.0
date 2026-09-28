/**
 * Billing Engine V2 — Sprint 2.3D: métricas in-memory do Projection Engine.
 */
import type { BillingProjectionDashboard, BillingProjectionHealthStats } from './types.js';

type MetricsState = {
  projectionsBuilt: number;
  totalProjectionTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  failures: number;
  hashMismatches: number;
  lastProjection: string | null;
  lastFailure: string | null;
};

const state: MetricsState = {
  projectionsBuilt: 0,
  totalProjectionTimeMs: 0,
  cacheHits: 0,
  cacheMisses: 0,
  failures: 0,
  hashMismatches: 0,
  lastProjection: null,
  lastFailure: null,
};

export function recordProjectionBuild(params: {
  durationMs: number;
  cacheHit: boolean;
  failed?: boolean;
  hashMismatch?: boolean;
}): void {
  if (params.cacheHit) {
    state.cacheHits += 1;
  } else {
    state.cacheMisses += 1;
    state.projectionsBuilt += 1;
    state.totalProjectionTimeMs += params.durationMs;
  }
  if (params.failed) {
    state.failures += 1;
    state.lastFailure = new Date().toISOString();
  }
  if (params.hashMismatch) {
    state.hashMismatches += 1;
  }
  state.lastProjection = new Date().toISOString();
}

export function getProjectionDashboardStats(): BillingProjectionDashboard {
  const totalCache = state.cacheHits + state.cacheMisses;
  return {
    projections_built: state.projectionsBuilt,
    average_projection_time_ms:
      state.projectionsBuilt > 0
        ? Math.round(state.totalProjectionTimeMs / state.projectionsBuilt)
        : null,
    cache_hit_rate: totalCache > 0 ? Math.round((state.cacheHits / totalCache) * 100) : null,
    projection_failures: state.failures,
    projection_hash_mismatch: state.hashMismatches,
  };
}

export function getProjectionHealthStats(): BillingProjectionHealthStats {
  const dash = getProjectionDashboardStats();
  return {
    healthy: state.failures === 0,
    average_projection_time: dash.average_projection_time_ms,
    projection_cache_hit: dash.cache_hit_rate,
    projection_failures: state.failures,
    last_projection: state.lastProjection,
    projection_hash_mismatch: state.hashMismatches,
  };
}

export function resetProjectionMetricsForTests(): void {
  state.projectionsBuilt = 0;
  state.totalProjectionTimeMs = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.failures = 0;
  state.hashMismatches = 0;
  state.lastProjection = null;
  state.lastFailure = null;
}
