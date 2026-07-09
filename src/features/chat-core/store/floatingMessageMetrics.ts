/**
 * F5.3 — métricas de render de mensagens (Floating).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

export type MessageRenderSource = 'store' | 'react-query';

type FloatingMessageMetrics = {
  messageRenderSource: MessageRenderSource | null;
  messageRenderMs: number;
  messageCount: number;
  appendLatency: number;
  socketApplyLatency: number;
};

const metrics: FloatingMessageMetrics = {
  messageRenderSource: null,
  messageRenderMs: 0,
  messageCount: 0,
  appendLatency: 0,
  socketApplyLatency: 0,
};

function enabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

export function recordFloatingMessageRender(params: {
  source: MessageRenderSource;
  durationMs: number;
  messageCount: number;
}): void {
  metrics.messageRenderSource = params.source;
  metrics.messageRenderMs = params.durationMs;
  metrics.messageCount = params.messageCount;
  log('floating_message_render', {
    messageRenderSource: params.source,
    messageRenderMs: params.durationMs,
    messageCount: params.messageCount,
  });
}

export function recordFloatingMessageAppendLatency(durationMs: number): void {
  metrics.appendLatency = durationMs;
  log('floating_message_append', { appendLatency: durationMs });
}

export function recordFloatingSocketApplyLatency(durationMs: number): void {
  metrics.socketApplyLatency = durationMs;
  log('floating_message_socket_apply', { socketApplyLatency: durationMs });
}

export function getFloatingMessageMetricsSnapshot(): Readonly<FloatingMessageMetrics> {
  return { ...metrics };
}

export function resetFloatingMessageMetrics(): void {
  metrics.messageRenderSource = null;
  metrics.messageRenderMs = 0;
  metrics.messageCount = 0;
  metrics.appendLatency = 0;
  metrics.socketApplyLatency = 0;
}
