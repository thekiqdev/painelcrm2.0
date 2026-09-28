/**
 * F5.12 — latência Socket.IO → Domain Store (apply) e marcação até UI.
 */

import {
  isChatPerformanceTelemetryEnabled,
  nowMs,
  perfCounters,
} from './performanceMetrics';

type SocketBucket = {
  count: number;
  applyMsTotal: number;
  uiMsTotal: number;
  uiSamples: number;
};

const byKind = new Map<string, SocketBucket>();

/** Evento WS em processamento — correlaciona apply → próximo notify/render. */
let pendingUi: { kind: string; startedAt: number } | null = null;

export function recordSocketApply(eventKind: string, applyMs: number): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  const ms = Math.max(0, applyMs);
  perfCounters.socketEvents += 1;
  perfCounters.socketApplyMsTotal += ms;
  const prev = byKind.get(eventKind) ?? {
    count: 0,
    applyMsTotal: 0,
    uiMsTotal: 0,
    uiSamples: 0,
  };
  prev.count += 1;
  prev.applyMsTotal += ms;
  byKind.set(eventKind, prev);
  pendingUi = { kind: eventKind, startedAt: nowMs() };
}

/** Chamado quando subscription notify / render ocorre após apply WS. */
export function recordSocketUiFlush(): void {
  if (!isChatPerformanceTelemetryEnabled() || !pendingUi) return;
  const { kind, startedAt } = pendingUi;
  pendingUi = null;
  const uiMs = Math.max(0, nowMs() - startedAt);
  const prev = byKind.get(kind);
  if (!prev) return;
  prev.uiMsTotal += uiMs;
  prev.uiSamples += 1;
  byKind.set(kind, prev);
}

export function getSocketMetricsSnapshot(): Readonly<{
  total: number;
  applyMsTotal: number;
  avgApplyMs: number;
  byKind: Record<
    string,
    { count: number; avgApplyMs: number; avgUiMs: number | null }
  >;
}> {
  const by: Record<string, { count: number; avgApplyMs: number; avgUiMs: number | null }> = {};
  for (const [kind, b] of byKind.entries()) {
    by[kind] = {
      count: b.count,
      avgApplyMs: b.count > 0 ? Math.round((b.applyMsTotal / b.count) * 1000) / 1000 : 0,
      avgUiMs:
        b.uiSamples > 0 ? Math.round((b.uiMsTotal / b.uiSamples) * 1000) / 1000 : null,
    };
  }
  return {
    total: perfCounters.socketEvents,
    applyMsTotal: Math.round(perfCounters.socketApplyMsTotal * 1000) / 1000,
    avgApplyMs:
      perfCounters.socketEvents > 0
        ? Math.round((perfCounters.socketApplyMsTotal / perfCounters.socketEvents) * 1000) / 1000
        : 0,
    byKind: by,
  };
}

export function resetSocketMetrics(): void {
  byKind.clear();
  pendingUi = null;
}
