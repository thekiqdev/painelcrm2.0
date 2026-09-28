/**
 * F5.12 — execuções / tempo de selectors (wrapper; lógica dos selectors inalterada).
 */

import {
  isChatPerformanceTelemetryEnabled,
  nowMs,
  perfCounters,
} from './performanceMetrics';

type SelectorBucket = {
  count: number;
  totalMs: number;
};

const byName = new Map<string, SelectorBucket>();

export function recordSelector(name: string, durationMs: number): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  const ms = Math.max(0, durationMs);
  perfCounters.selectors += 1;
  perfCounters.selectorMsTotal += ms;
  const prev = byName.get(name) ?? { count: 0, totalMs: 0 };
  prev.count += 1;
  prev.totalMs += ms;
  byName.set(name, prev);
}

/** Executa selector medindo tempo quando telemetria ON. */
export function timeSelector<T>(name: string, run: () => T): T {
  if (!isChatPerformanceTelemetryEnabled()) return run();
  const t0 = nowMs();
  try {
    return run();
  } finally {
    recordSelector(name, nowMs() - t0);
  }
}

export function getSelectorMetricsSnapshot(): Readonly<{
  total: number;
  totalMs: number;
  avgMs: number;
  byName: Record<string, { count: number; totalMs: number; avgMs: number }>;
}> {
  const by: Record<string, { count: number; totalMs: number; avgMs: number }> = {};
  for (const [name, b] of byName.entries()) {
    by[name] = {
      count: b.count,
      totalMs: Math.round(b.totalMs * 1000) / 1000,
      avgMs: b.count > 0 ? Math.round((b.totalMs / b.count) * 1000) / 1000 : 0,
    };
  }
  return {
    total: perfCounters.selectors,
    totalMs: Math.round(perfCounters.selectorMsTotal * 1000) / 1000,
    avgMs:
      perfCounters.selectors > 0
        ? Math.round((perfCounters.selectorMsTotal / perfCounters.selectors) * 1000) / 1000
        : 0,
    byName: by,
  };
}

export function resetSelectorMetrics(): void {
  byName.clear();
}
