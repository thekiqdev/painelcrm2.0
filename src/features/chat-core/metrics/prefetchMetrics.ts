/**
 * F6.6 — telemetria Warm Window / Predictive Prefetch (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled, nowMs } from './performanceMetrics';

type PrefetchMetrics = {
  prefetchRequests: number;
  prefetchHits: number;
  prefetchMisses: number;
  warmWindowHits: number;
  warmWindowMisses: number;
  idlePrefetchCount: number;
  prefetchCancellation: number;
  openTimeSamples: number;
  openTimeTotalMs: number;
};

const metrics: PrefetchMetrics = {
  prefetchRequests: 0,
  prefetchHits: 0,
  prefetchMisses: 0,
  warmWindowHits: 0,
  warmWindowMisses: 0,
  idlePrefetchCount: 0,
  prefetchCancellation: 0,
  openTimeSamples: 0,
  openTimeTotalMs: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export type PrefetchLogEvent = 'warm' | 'hit' | 'miss' | 'idle' | 'cancel';

export function logPrefetchEvent(
  event: PrefetchLogEvent,
  payload: Record<string, unknown> = {},
): void {
  if (!enabled()) return;
  console.info(`[Prefetch] ${event}`, payload);
}

export function recordPrefetchRequest(conversationId?: string): void {
  if (!enabled()) return;
  metrics.prefetchRequests += 1;
  logPrefetchEvent('warm', conversationId ? { conversationId } : {});
}

export function recordPrefetchHit(conversationId?: string): void {
  if (!enabled()) return;
  metrics.prefetchHits += 1;
  logPrefetchEvent('hit', conversationId ? { conversationId, kind: 'prefetch' } : { kind: 'prefetch' });
}

export function recordPrefetchMiss(conversationId?: string): void {
  if (!enabled()) return;
  metrics.prefetchMisses += 1;
  logPrefetchEvent('miss', conversationId ? { conversationId, kind: 'prefetch' } : { kind: 'prefetch' });
}

export function recordWarmWindowHit(conversationId?: string): void {
  if (!enabled()) return;
  metrics.warmWindowHits += 1;
  logPrefetchEvent('hit', conversationId ? { conversationId, kind: 'warm-window' } : { kind: 'warm-window' });
}

export function recordWarmWindowMiss(conversationId?: string): void {
  if (!enabled()) return;
  metrics.warmWindowMisses += 1;
  logPrefetchEvent('miss', conversationId ? { conversationId, kind: 'warm-window' } : { kind: 'warm-window' });
}

export function recordIdlePrefetch(count: number): void {
  if (!enabled()) return;
  metrics.idlePrefetchCount += 1;
  logPrefetchEvent('idle', { count });
}

export function recordPrefetchCancellation(reason?: string): void {
  if (!enabled()) return;
  metrics.prefetchCancellation += 1;
  logPrefetchEvent('cancel', reason ? { reason } : {});
}

export function recordConversationOpenTime(durationMs: number): void {
  if (!enabled()) return;
  metrics.openTimeSamples += 1;
  metrics.openTimeTotalMs += Math.max(0, durationMs);
}

export function getPrefetchMetricsSnapshot(): Readonly<{
  prefetchRequests: number;
  prefetchHits: number;
  prefetchMisses: number;
  warmWindowHits: number;
  warmWindowMisses: number;
  idlePrefetchCount: number;
  prefetchCancellation: number;
  averageConversationOpenTime: number;
}> {
  return {
    prefetchRequests: metrics.prefetchRequests,
    prefetchHits: metrics.prefetchHits,
    prefetchMisses: metrics.prefetchMisses,
    warmWindowHits: metrics.warmWindowHits,
    warmWindowMisses: metrics.warmWindowMisses,
    idlePrefetchCount: metrics.idlePrefetchCount,
    prefetchCancellation: metrics.prefetchCancellation,
    averageConversationOpenTime:
      metrics.openTimeSamples > 0
        ? Math.round((metrics.openTimeTotalMs / metrics.openTimeSamples) * 100) / 100
        : 0,
  };
}

export function resetPrefetchMetrics(): void {
  metrics.prefetchRequests = 0;
  metrics.prefetchHits = 0;
  metrics.prefetchMisses = 0;
  metrics.warmWindowHits = 0;
  metrics.warmWindowMisses = 0;
  metrics.idlePrefetchCount = 0;
  metrics.prefetchCancellation = 0;
  metrics.openTimeSamples = 0;
  metrics.openTimeTotalMs = 0;
}

/** Utilitário de teste / instrumentação. */
export function measureConversationOpenTime<T>(run: () => T): T {
  if (!enabled()) return run();
  const t0 = nowMs();
  try {
    return run();
  } finally {
    recordConversationOpenTime(nowMs() - t0);
  }
}
