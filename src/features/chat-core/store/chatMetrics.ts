/**
 * F5.4 — métricas de render do Chat Principal (read-only).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

export type ChatRenderSource = 'store' | 'react-query';

type ChatPrincipalMetrics = {
  chatConversationRenderSource: ChatRenderSource | null;
  chatConversationRenderMs: number;
  chatMessagesRenderSource: ChatRenderSource | null;
  chatMessagesRenderMs: number;
};

const metrics: ChatPrincipalMetrics = {
  chatConversationRenderSource: null,
  chatConversationRenderMs: 0,
  chatMessagesRenderSource: null,
  chatMessagesRenderMs: 0,
};

function enabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

export function recordChatConversationRender(params: {
  source: ChatRenderSource;
  durationMs: number;
}): void {
  metrics.chatConversationRenderSource = params.source;
  metrics.chatConversationRenderMs = params.durationMs;
  log('chat_conversation_render', {
    chatConversationRenderSource: params.source,
    chatConversationRenderMs: params.durationMs,
  });
}

export function recordChatMessagesRender(params: {
  source: ChatRenderSource;
  durationMs: number;
}): void {
  metrics.chatMessagesRenderSource = params.source;
  metrics.chatMessagesRenderMs = params.durationMs;
  log('chat_messages_render', {
    chatMessagesRenderSource: params.source,
    chatMessagesRenderMs: params.durationMs,
  });
}

export function getChatPrincipalMetricsSnapshot(): Readonly<ChatPrincipalMetrics> {
  return { ...metrics };
}

export function resetChatPrincipalMetrics(): void {
  metrics.chatConversationRenderSource = null;
  metrics.chatConversationRenderMs = 0;
  metrics.chatMessagesRenderSource = null;
  metrics.chatMessagesRenderMs = 0;
}
