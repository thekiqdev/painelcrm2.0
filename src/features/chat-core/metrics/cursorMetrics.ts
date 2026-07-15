/**
 * F6.0 — telemetria de paginação por cursor (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled } from './performanceMetrics';

type CursorMetrics = {
  cursorRequests: number;
  cursorLatencyTotalMs: number;
  messagesPrepended: number;
  duplicateMessagesDiscarded: number;
  cursorLoadTimeTotalMs: number;
  scrollPreservationTimeTotalMs: number;
  scrollPreservationSamples: number;
};

const metrics: CursorMetrics = {
  cursorRequests: 0,
  cursorLatencyTotalMs: 0,
  messagesPrepended: 0,
  duplicateMessagesDiscarded: 0,
  cursorLoadTimeTotalMs: 0,
  scrollPreservationTimeTotalMs: 0,
  scrollPreservationSamples: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logCursorEvent(
  event: 'load' | 'prepend' | 'merge' | 'duplicate' | 'hasMore' | 'nextCursor' | 'reset',
  payload: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info(`[Cursor] ${event}`, payload);
}

export function recordCursorRequest(): void {
  if (!enabled()) return;
  metrics.cursorRequests += 1;
}

export function recordCursorLatency(ms: number): void {
  if (!enabled()) return;
  metrics.cursorLatencyTotalMs += Math.max(0, ms);
}

export function recordCursorPrepended(count: number): void {
  if (!enabled()) return;
  metrics.messagesPrepended += Math.max(0, count);
}

export function recordCursorDuplicates(count: number): void {
  if (!enabled()) return;
  metrics.duplicateMessagesDiscarded += Math.max(0, count);
}

export function recordCursorLoadTime(ms: number): void {
  if (!enabled()) return;
  metrics.cursorLoadTimeTotalMs += Math.max(0, ms);
}

export function recordScrollPreservationTime(ms: number): void {
  if (!enabled()) return;
  metrics.scrollPreservationTimeTotalMs += Math.max(0, ms);
  metrics.scrollPreservationSamples += 1;
}

export function getCursorMetricsSnapshot(): Readonly<{
  cursorRequests: number;
  cursorLatency: number;
  messagesPrepended: number;
  duplicateMessagesDiscarded: number;
  cursorLoadTime: number;
  scrollPreservationTime: number;
}> {
  const avgLatency =
    metrics.cursorRequests > 0
      ? Math.round((metrics.cursorLatencyTotalMs / metrics.cursorRequests) * 1000) / 1000
      : 0;
  const avgScroll =
    metrics.scrollPreservationSamples > 0
      ? Math.round(
          (metrics.scrollPreservationTimeTotalMs / metrics.scrollPreservationSamples) * 1000,
        ) / 1000
      : 0;
  return {
    cursorRequests: metrics.cursorRequests,
    cursorLatency: avgLatency,
    messagesPrepended: metrics.messagesPrepended,
    duplicateMessagesDiscarded: metrics.duplicateMessagesDiscarded,
    cursorLoadTime: Math.round(metrics.cursorLoadTimeTotalMs * 1000) / 1000,
    scrollPreservationTime: avgScroll,
  };
}

export function resetCursorMetrics(): void {
  metrics.cursorRequests = 0;
  metrics.cursorLatencyTotalMs = 0;
  metrics.messagesPrepended = 0;
  metrics.duplicateMessagesDiscarded = 0;
  metrics.cursorLoadTimeTotalMs = 0;
  metrics.scrollPreservationTimeTotalMs = 0;
  metrics.scrollPreservationSamples = 0;
}
