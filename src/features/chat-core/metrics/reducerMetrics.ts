/**
 * F5.12 — dispatches / tempo de reducer (sem alterar lógica do reducer).
 */

import {
  isChatPerformanceTelemetryEnabled,
  nowMs,
  perfCounters,
} from './performanceMetrics';

type ReducerBucket = {
  count: number;
  totalMs: number;
};

const byType = new Map<string, ReducerBucket>();

export function recordReducer(actionType: string, durationMs: number): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  const ms = Math.max(0, durationMs);
  perfCounters.reducers += 1;
  perfCounters.reducerMsTotal += ms;
  const prev = byType.get(actionType) ?? { count: 0, totalMs: 0 };
  prev.count += 1;
  prev.totalMs += ms;
  byType.set(actionType, prev);
}

export function timeReducer<T>(actionType: string, run: () => T): T {
  if (!isChatPerformanceTelemetryEnabled()) return run();
  const t0 = nowMs();
  try {
    return run();
  } finally {
    recordReducer(actionType, nowMs() - t0);
  }
}

export function getReducerMetricsSnapshot(): Readonly<{
  total: number;
  totalMs: number;
  avgMs: number;
  byType: Record<string, { count: number; totalMs: number; avgMs: number }>;
}> {
  const by: Record<string, { count: number; totalMs: number; avgMs: number }> = {};
  for (const [type, b] of byType.entries()) {
    by[type] = {
      count: b.count,
      totalMs: Math.round(b.totalMs * 1000) / 1000,
      avgMs: b.count > 0 ? Math.round((b.totalMs / b.count) * 1000) / 1000 : 0,
    };
  }
  return {
    total: perfCounters.reducers,
    totalMs: Math.round(perfCounters.reducerMsTotal * 1000) / 1000,
    avgMs:
      perfCounters.reducers > 0
        ? Math.round((perfCounters.reducerMsTotal / perfCounters.reducers) * 1000) / 1000
        : 0,
    byType: by,
  };
}

export function resetReducerMetrics(): void {
  byType.clear();
}
