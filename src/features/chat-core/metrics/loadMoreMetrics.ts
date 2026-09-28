/**
 * F6.1 — telemetria do Load More (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled } from './performanceMetrics';

type LoadMoreMetrics = {
  loadMoreClicks: number;
  pagesLoaded: number;
  messagesPrepended: number;
  scrollRestoreLatencyTotalMs: number;
  scrollRestoreSamples: number;
  duplicateRequestsPrevented: number;
  loadMoreDurationTotalMs: number;
  loadMoreDurationSamples: number;
};

const metrics: LoadMoreMetrics = {
  loadMoreClicks: 0,
  pagesLoaded: 0,
  messagesPrepended: 0,
  scrollRestoreLatencyTotalMs: 0,
  scrollRestoreSamples: 0,
  duplicateRequestsPrevented: 0,
  loadMoreDurationTotalMs: 0,
  loadMoreDurationSamples: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logLoadMoreEvent(
  event: 'click' | 'request' | 'prepend' | 'restore-scroll' | 'completed' | 'blocked',
  payload: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info(`[LoadMore] ${event}`, payload);
}

export function recordLoadMoreClick(): void {
  if (!enabled()) return;
  metrics.loadMoreClicks += 1;
}

export function recordLoadMorePage(prepended: number, durationMs: number): void {
  if (!enabled()) return;
  metrics.pagesLoaded += 1;
  metrics.messagesPrepended += Math.max(0, prepended);
  metrics.loadMoreDurationTotalMs += Math.max(0, durationMs);
  metrics.loadMoreDurationSamples += 1;
}

export function recordLoadMoreScrollRestore(ms: number): void {
  if (!enabled()) return;
  metrics.scrollRestoreLatencyTotalMs += Math.max(0, ms);
  metrics.scrollRestoreSamples += 1;
}

export function recordLoadMoreDuplicatePrevented(): void {
  if (!enabled()) return;
  metrics.duplicateRequestsPrevented += 1;
}

export function getLoadMoreMetricsSnapshot(): Readonly<{
  loadMoreClicks: number;
  pagesLoaded: number;
  messagesPrepended: number;
  scrollRestoreLatency: number;
  duplicateRequestsPrevented: number;
  loadMoreDuration: number;
}> {
  return {
    loadMoreClicks: metrics.loadMoreClicks,
    pagesLoaded: metrics.pagesLoaded,
    messagesPrepended: metrics.messagesPrepended,
    scrollRestoreLatency:
      metrics.scrollRestoreSamples > 0
        ? Math.round(
            (metrics.scrollRestoreLatencyTotalMs / metrics.scrollRestoreSamples) * 1000,
          ) / 1000
        : 0,
    duplicateRequestsPrevented: metrics.duplicateRequestsPrevented,
    loadMoreDuration:
      metrics.loadMoreDurationSamples > 0
        ? Math.round(
            (metrics.loadMoreDurationTotalMs / metrics.loadMoreDurationSamples) * 1000,
          ) / 1000
        : 0,
  };
}

export function resetLoadMoreMetrics(): void {
  metrics.loadMoreClicks = 0;
  metrics.pagesLoaded = 0;
  metrics.messagesPrepended = 0;
  metrics.scrollRestoreLatencyTotalMs = 0;
  metrics.scrollRestoreSamples = 0;
  metrics.duplicateRequestsPrevented = 0;
  metrics.loadMoreDurationTotalMs = 0;
  metrics.loadMoreDurationSamples = 0;
}
