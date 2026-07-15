/**
 * F6.4 — telemetria da virtualização de mensagens (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled, nowMs } from './performanceMetrics';

type MessageVirtualMetrics = {
  visibleMessages: number;
  virtualizedMessages: number;
  overscanMessages: number;
  renderSavings: number;
  renderSamples: number;
  renderTotalMs: number;
  scrollFrames: number;
  scrollFrameWindowStart: number;
  heightCacheHits: number;
  heightCacheMisses: number;
  messageRecycleCount: number;
  prependCount: number;
  appendCount: number;
  windowMoves: number;
};

const metrics: MessageVirtualMetrics = {
  visibleMessages: 0,
  virtualizedMessages: 0,
  overscanMessages: 0,
  renderSavings: 0,
  renderSamples: 0,
  renderTotalMs: 0,
  scrollFrames: 0,
  scrollFrameWindowStart: 0,
  heightCacheHits: 0,
  heightCacheMisses: 0,
  messageRecycleCount: 0,
  prependCount: 0,
  appendCount: 0,
  windowMoves: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logMessageVirtualEvent(
  event: 'render' | 'move' | 'recycle' | 'cache-hit' | 'cache-miss' | 'prepend' | 'append',
  payload: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info(`[MessageVirtual] ${event}`, payload);
}

export function recordMessageVirtualRender(params: {
  visibleMessages: number;
  overscanMessages: number;
  virtualizedMessages: number;
  totalMessages: number;
  renderMs?: number;
}): void {
  if (!enabled()) return;
  metrics.visibleMessages = params.visibleMessages;
  metrics.overscanMessages = params.overscanMessages;
  metrics.virtualizedMessages = params.virtualizedMessages;
  metrics.renderSavings =
    params.totalMessages > 0
      ? Math.round((params.virtualizedMessages / params.totalMessages) * 1000) / 10
      : 0;
  if (params.renderMs !== undefined) {
    metrics.renderSamples += 1;
    metrics.renderTotalMs += params.renderMs;
  }
}

export function recordMessageVirtualMove(): void {
  if (!enabled()) return;
  metrics.windowMoves += 1;
}

export function recordMessageScrollFrame(): void {
  if (!enabled()) return;
  const now = nowMs();
  if (metrics.scrollFrameWindowStart === 0) metrics.scrollFrameWindowStart = now;
  metrics.scrollFrames += 1;
}

export function recordMessageHeightCacheHit(): void {
  if (!enabled()) return;
  metrics.heightCacheHits += 1;
}

export function recordMessageHeightCacheMiss(): void {
  if (!enabled()) return;
  metrics.heightCacheMisses += 1;
}

export function recordMessageRecycle(): void {
  if (!enabled()) return;
  metrics.messageRecycleCount += 1;
}

export function recordMessagePrepend(added: number): void {
  if (!enabled()) return;
  metrics.prependCount += 1;
  logMessageVirtualEvent('prepend', { added });
}

export function recordMessageAppend(added: number): void {
  if (!enabled()) return;
  metrics.appendCount += 1;
  logMessageVirtualEvent('append', { added });
}

export function getMessageVirtualizationMetricsSnapshot(): Readonly<{
  visibleMessages: number;
  virtualizedMessages: number;
  overscanMessages: number;
  renderSavings: number;
  renderTime: number;
  scrollFPS: number;
  heightCacheHits: number;
  heightCacheMisses: number;
  messageRecycleCount: number;
}> {
  const elapsedSec =
    metrics.scrollFrameWindowStart > 0
      ? Math.max(0.001, (nowMs() - metrics.scrollFrameWindowStart) / 1000)
      : 0;
  return {
    visibleMessages: metrics.visibleMessages,
    virtualizedMessages: metrics.virtualizedMessages,
    overscanMessages: metrics.overscanMessages,
    renderSavings: metrics.renderSavings,
    renderTime:
      metrics.renderSamples > 0
        ? Math.round((metrics.renderTotalMs / metrics.renderSamples) * 100) / 100
        : 0,
    scrollFPS: elapsedSec > 0 ? Math.round((metrics.scrollFrames / elapsedSec) * 10) / 10 : 0,
    heightCacheHits: metrics.heightCacheHits,
    heightCacheMisses: metrics.heightCacheMisses,
    messageRecycleCount: metrics.messageRecycleCount,
  };
}

export function resetMessageVirtualizationMetrics(): void {
  metrics.visibleMessages = 0;
  metrics.virtualizedMessages = 0;
  metrics.overscanMessages = 0;
  metrics.renderSavings = 0;
  metrics.renderSamples = 0;
  metrics.renderTotalMs = 0;
  metrics.scrollFrames = 0;
  metrics.scrollFrameWindowStart = 0;
  metrics.heightCacheHits = 0;
  metrics.heightCacheMisses = 0;
  metrics.messageRecycleCount = 0;
  metrics.prependCount = 0;
  metrics.appendCount = 0;
  metrics.windowMoves = 0;
}
