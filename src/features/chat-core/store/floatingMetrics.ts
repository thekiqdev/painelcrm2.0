/**
 * F5.2 — métricas de render da lista de conversas (Floating).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

export type ConversationRenderSource = 'store' | 'react-query';

type FloatingConversationMetrics = {
  conversationRenderSource: ConversationRenderSource | null;
  conversationRenderMs: number;
  storeConversationCount: number;
  repositoryConversationCount: number;
};

const metrics: FloatingConversationMetrics = {
  conversationRenderSource: null,
  conversationRenderMs: 0,
  storeConversationCount: 0,
  repositoryConversationCount: 0,
};

function enabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

export function recordFloatingConversationRender(params: {
  source: ConversationRenderSource;
  durationMs: number;
  storeCount: number;
  repositoryCount: number;
}): void {
  metrics.conversationRenderSource = params.source;
  metrics.conversationRenderMs = params.durationMs;
  metrics.storeConversationCount = params.storeCount;
  metrics.repositoryConversationCount = params.repositoryCount;
  log('floating_conversation_render', {
    conversationRenderSource: params.source,
    conversationRenderMs: params.durationMs,
    storeConversationCount: params.storeCount,
    repositoryConversationCount: params.repositoryCount,
  });
}

export function getFloatingConversationMetricsSnapshot(): Readonly<FloatingConversationMetrics> {
  return { ...metrics };
}

export function resetFloatingConversationMetrics(): void {
  metrics.conversationRenderSource = null;
  metrics.conversationRenderMs = 0;
  metrics.storeConversationCount = 0;
  metrics.repositoryConversationCount = 0;
}
