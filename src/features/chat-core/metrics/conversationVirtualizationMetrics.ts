/**
 * F6.3 — telemetria da virtualização de conversas (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled, nowMs } from './performanceMetrics';

type ConversationVirtualMetrics = {
  visibleRows: number;
  overscanRows: number;
  virtualizedRows: number;
  renderSavings: number;
  renderSamples: number;
  renderTotalMs: number;
  scrollFrames: number;
  scrollFrameWindowStart: number;
  windowMoves: number;
  heightCacheHits: number;
  heightCacheMisses: number;
};

const metrics: ConversationVirtualMetrics = {
  visibleRows: 0,
  overscanRows: 0,
  virtualizedRows: 0,
  renderSavings: 0,
  renderSamples: 0,
  renderTotalMs: 0,
  scrollFrames: 0,
  scrollFrameWindowStart: 0,
  windowMoves: 0,
  heightCacheHits: 0,
  heightCacheMisses: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logConversationVirtualEvent(
  event: 'render' | 'move' | 'overscan' | 'recycle' | 'cache-hit' | 'cache-miss',
  payload: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info(`[ConversationVirtual] ${event}`, payload);
}

export function recordConversationVirtualRender(params: {
  visibleRows: number;
  overscanRows: number;
  virtualizedRows: number;
  totalRows: number;
  renderMs?: number;
}): void {
  if (!enabled()) return;
  metrics.visibleRows = params.visibleRows;
  metrics.overscanRows = params.overscanRows;
  metrics.virtualizedRows = params.virtualizedRows;
  metrics.renderSavings =
    params.totalRows > 0
      ? Math.round((params.virtualizedRows / params.totalRows) * 1000) / 10
      : 0;
  if (params.renderMs !== undefined) {
    metrics.renderSamples += 1;
    metrics.renderTotalMs += params.renderMs;
  }
}

export function recordConversationVirtualMove(): void {
  if (!enabled()) return;
  metrics.windowMoves += 1;
}

export function recordConversationScrollFrame(): void {
  if (!enabled()) return;
  const now = nowMs();
  if (metrics.scrollFrameWindowStart === 0) {
    metrics.scrollFrameWindowStart = now;
  }
  metrics.scrollFrames += 1;
}

export function recordHeightCacheHit(): void {
  if (!enabled()) return;
  metrics.heightCacheHits += 1;
}

export function recordHeightCacheMiss(): void {
  if (!enabled()) return;
  metrics.heightCacheMisses += 1;
}

export function getConversationVirtualizationMetricsSnapshot(): Readonly<{
  visibleRows: number;
  overscanRows: number;
  virtualizedRows: number;
  renderSavings: number;
  averageRenderTime: number;
  scrollFPS: number;
  windowMoves: number;
  heightCacheHits: number;
  heightCacheMisses: number;
}> {
  const elapsedSec =
    metrics.scrollFrameWindowStart > 0
      ? Math.max(0.001, (nowMs() - metrics.scrollFrameWindowStart) / 1000)
      : 0;
  return {
    visibleRows: metrics.visibleRows,
    overscanRows: metrics.overscanRows,
    virtualizedRows: metrics.virtualizedRows,
    renderSavings: metrics.renderSavings,
    averageRenderTime:
      metrics.renderSamples > 0
        ? Math.round((metrics.renderTotalMs / metrics.renderSamples) * 100) / 100
        : 0,
    scrollFPS: elapsedSec > 0 ? Math.round((metrics.scrollFrames / elapsedSec) * 10) / 10 : 0,
    windowMoves: metrics.windowMoves,
    heightCacheHits: metrics.heightCacheHits,
    heightCacheMisses: metrics.heightCacheMisses,
  };
}

export function resetConversationVirtualizationMetrics(): void {
  metrics.visibleRows = 0;
  metrics.overscanRows = 0;
  metrics.virtualizedRows = 0;
  metrics.renderSavings = 0;
  metrics.renderSamples = 0;
  metrics.renderTotalMs = 0;
  metrics.scrollFrames = 0;
  metrics.scrollFrameWindowStart = 0;
  metrics.windowMoves = 0;
  metrics.heightCacheHits = 0;
  metrics.heightCacheMisses = 0;
}
