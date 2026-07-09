/**
 * F5.6 — métricas consolidadas do Domain Store.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

type ConsolidatedMetrics = {
  chatRenderMs: number;
  commandLatency: number;
  socketLatency: number;
  storeUpdates: number;
  selectorExecutions: number;
  storeSubscriptions: number;
};

const metrics: ConsolidatedMetrics = {
  chatRenderMs: 0,
  commandLatency: 0,
  socketLatency: 0,
  storeUpdates: 0,
  selectorExecutions: 0,
  storeSubscriptions: 0,
};

function enabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[chat-core-consolidated] ${event}`, payload);
}

export function recordChatRenderMs(durationMs: number): void {
  metrics.chatRenderMs += durationMs;
  log('chat_render', { durationMs, totalMs: metrics.chatRenderMs });
}

export function recordCommandLatency(durationMs: number): void {
  metrics.commandLatency += durationMs;
  log('command_latency', { durationMs, totalMs: metrics.commandLatency });
}

export function recordSocketLatency(durationMs: number): void {
  metrics.socketLatency += durationMs;
  log('socket_latency', { durationMs, totalMs: metrics.socketLatency });
}

export function recordStoreUpdate(kind: 'conversations' | 'messages' | 'event'): void {
  metrics.storeUpdates += 1;
  log('store_update', { kind, storeUpdates: metrics.storeUpdates });
}

export function recordSelectorExecution(_selector: string): void {
  metrics.selectorExecutions += 1;
}

export function recordStoreSubscription(): void {
  metrics.storeSubscriptions += 1;
}

export function getConsolidatedMetricsSnapshot(): Readonly<ConsolidatedMetrics> {
  return { ...metrics };
}

export function resetConsolidatedMetrics(): void {
  metrics.chatRenderMs = 0;
  metrics.commandLatency = 0;
  metrics.socketLatency = 0;
  metrics.storeUpdates = 0;
  metrics.selectorExecutions = 0;
  metrics.storeSubscriptions = 0;
}
