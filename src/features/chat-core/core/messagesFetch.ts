/**
 * F5.10 — fetch unificado de mensagens (HTTP apenas, sem escrita no Store).
 */

import { chatService } from '@/services/chat';
import { delegatingChatRepository } from '../repository/delegatingChatRepository';
import type { ChatConversationId, ChatDomainMessage } from '../domain/types';
import { recordHttpMetric } from '../metrics/httpMetrics';

export async function fetchConversationMessages(
  conversationId: ChatConversationId,
): Promise<ChatDomainMessage[]> {
  const rows = await delegatingChatRepository.getMessages(conversationId);
  // GET messages já é contabilizado via recordChatHttpRequest no repository.
  void chatService.syncConversationMessages(conversationId, {}).catch(() => {});
  recordHttpMetric({
    kind: 'POST syncConversationMessages',
    endpoint: `/api/chat/conversations/${conversationId}/messages/sync`,
    method: 'POST',
    source: 'messagesFetch',
  });
  return rows;
}
