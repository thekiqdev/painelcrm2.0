/**
 * F6.2 — telemetria do Sliding Window Cache (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled } from '../metrics/performanceMetrics';

type WindowMetrics = {
  residentPages: number;
  evictedPages: number;
  windowMoves: number;
  windowHits: number;
  windowMisses: number;
  memorySavedBytes: number;
  pageReloads: number;
  residentMessageSamples: number;
  residentMessageTotal: number;
};

const metrics: WindowMetrics = {
  residentPages: 0,
  evictedPages: 0,
  windowMoves: 0,
  windowHits: 0,
  windowMisses: 0,
  memorySavedBytes: 0,
  pageReloads: 0,
  residentMessageSamples: 0,
  residentMessageTotal: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logWindowEvent(
  event: 'register' | 'move' | 'pin' | 'evict' | 'reload' | 'trim',
  payload: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info(`[Window] ${event}`, payload);
}

export function recordWindowRegister(residentCount: number, messageCount: number): void {
  if (!enabled()) return;
  metrics.residentPages = residentCount;
  metrics.residentMessageSamples += 1;
  metrics.residentMessageTotal += messageCount;
}

export function recordWindowMove(): void {
  if (!enabled()) return;
  metrics.windowMoves += 1;
}

export function recordWindowEvict(pages: number, savedBytes: number): void {
  if (!enabled()) return;
  metrics.evictedPages += pages;
  metrics.memorySavedBytes += Math.max(0, savedBytes);
}

export function recordWindowHit(): void {
  if (!enabled()) return;
  metrics.windowHits += 1;
}

export function recordWindowMiss(): void {
  if (!enabled()) return;
  metrics.windowMisses += 1;
}

export function recordWindowReload(): void {
  if (!enabled()) return;
  metrics.pageReloads += 1;
}

export function getWindowMetricsSnapshot(): Readonly<{
  residentPages: number;
  evictedPages: number;
  windowMoves: number;
  windowHits: number;
  windowMisses: number;
  memorySavedBytes: number;
  pageReloads: number;
  averageResidentMessages: number;
}> {
  return {
    residentPages: metrics.residentPages,
    evictedPages: metrics.evictedPages,
    windowMoves: metrics.windowMoves,
    windowHits: metrics.windowHits,
    windowMisses: metrics.windowMisses,
    memorySavedBytes: metrics.memorySavedBytes,
    pageReloads: metrics.pageReloads,
    averageResidentMessages:
      metrics.residentMessageSamples > 0
        ? Math.round(
            (metrics.residentMessageTotal / metrics.residentMessageSamples) * 100,
          ) / 100
        : 0,
  };
}

export function resetWindowMetrics(): void {
  metrics.residentPages = 0;
  metrics.evictedPages = 0;
  metrics.windowMoves = 0;
  metrics.windowHits = 0;
  metrics.windowMisses = 0;
  metrics.memorySavedBytes = 0;
  metrics.pageReloads = 0;
  metrics.residentMessageSamples = 0;
  metrics.residentMessageTotal = 0;
}
