/**
 * F5.1 — métricas do Domain Store (shadow).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

type StoreMetricsState = {
  storeHydrationMs: number;
  storeSyncMs: number;
  storeEventCount: number;
  storeRepositoryUpdates: number;
  storeRealtimeUpdates: number;
  storeCommandUpdates: number;
};

const metrics: StoreMetricsState = {
  storeHydrationMs: 0,
  storeSyncMs: 0,
  storeEventCount: 0,
  storeRepositoryUpdates: 0,
  storeRealtimeUpdates: 0,
  storeCommandUpdates: 0,
};

function log(event: string, payload: Record<string, unknown>): void {
  if (!isChatMigrationFlagEnabled('CHAT_CORE_METRICS')) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

export function recordStoreHydrationMs(durationMs: number): void {
  metrics.storeHydrationMs += durationMs;
  log('store_hydration', { durationMs, totalMs: metrics.storeHydrationMs });
}

export function recordStoreSyncMs(durationMs: number): void {
  metrics.storeSyncMs += durationMs;
  log('store_sync', { durationMs, totalMs: metrics.storeSyncMs });
}

export function recordStoreEventApplied(kind: 'repository' | 'realtime' | 'command'): void {
  metrics.storeEventCount += 1;
  if (kind === 'repository') metrics.storeRepositoryUpdates += 1;
  if (kind === 'realtime') metrics.storeRealtimeUpdates += 1;
  if (kind === 'command') metrics.storeCommandUpdates += 1;
  log('store_event', {
    kind,
    storeEventCount: metrics.storeEventCount,
    storeRepositoryUpdates: metrics.storeRepositoryUpdates,
    storeRealtimeUpdates: metrics.storeRealtimeUpdates,
    storeCommandUpdates: metrics.storeCommandUpdates,
  });
}

export function getChatStoreMetricsSnapshot(): Readonly<StoreMetricsState> {
  return { ...metrics };
}

export function resetChatStoreMetrics(): void {
  metrics.storeHydrationMs = 0;
  metrics.storeSyncMs = 0;
  metrics.storeEventCount = 0;
  metrics.storeRepositoryUpdates = 0;
  metrics.storeRealtimeUpdates = 0;
  metrics.storeCommandUpdates = 0;
  log('store_metrics_reset', {});
}
