/**
 * Billing Engine V2 — Sprint 2.3C: métricas in-memory do Context Builder.
 */
import type {
  BillingExecutionContextDashboard,
  BillingExecutionContextHealthStats,
} from './types.js';

type MetricsState = {
  contextsBuilt: number;
  totalBuildTimeMs: number;
  cacheHits: number;
  cacheMisses: number;
  builderErrors: number;
  builderWarnings: number;
  lastBuild: string | null;
  lastFailure: string | null;
};

const state: MetricsState = {
  contextsBuilt: 0,
  totalBuildTimeMs: 0,
  cacheHits: 0,
  cacheMisses: 0,
  builderErrors: 0,
  builderWarnings: 0,
  lastBuild: null,
  lastFailure: null,
};

export function recordContextBuild(params: {
  durationMs: number;
  cacheHit: boolean;
  warnings: number;
  errors: number;
  failed?: boolean;
}): void {
  if (params.cacheHit) state.cacheHits += 1;
  else {
    state.cacheMisses += 1;
    state.contextsBuilt += 1;
    state.totalBuildTimeMs += params.durationMs;
    state.builderWarnings += params.warnings;
    if (params.failed) {
      state.builderErrors += 1;
      state.lastFailure = new Date().toISOString();
    }
  }
  state.lastBuild = new Date().toISOString();
}

export function getContextDashboardStats(): BillingExecutionContextDashboard {
  const totalCache = state.cacheHits + state.cacheMisses;
  return {
    contexts_built: state.contextsBuilt,
    average_build_time_ms:
      state.contextsBuilt > 0 ? Math.round(state.totalBuildTimeMs / state.contextsBuilt) : null,
    cache_hit_rate: totalCache > 0 ? Math.round((state.cacheHits / totalCache) * 100) : null,
    builder_errors: state.builderErrors,
    builder_warnings: state.builderWarnings,
  };
}

export function getContextHealthStats(): BillingExecutionContextHealthStats {
  const dash = getContextDashboardStats();
  return {
    healthy: state.builderErrors === 0,
    builder_time_avg: dash.average_build_time_ms,
    cache_hit_rate: dash.cache_hit_rate,
    last_failure: state.lastFailure,
    last_build: state.lastBuild,
    contexts_built: state.contextsBuilt,
    builder_errors: state.builderErrors,
    builder_warnings: state.builderWarnings,
  };
}

export function resetContextMetricsForTests(): void {
  state.contextsBuilt = 0;
  state.totalBuildTimeMs = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.builderErrors = 0;
  state.builderWarnings = 0;
  state.lastBuild = null;
  state.lastFailure = null;
}
