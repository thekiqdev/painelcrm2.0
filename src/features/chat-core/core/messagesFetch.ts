/**
 * F5.10 — fetch unificado de mensagens (HTTP apenas, sem escrita no Store).
 */

import { chatService } from '@/services/chat';
import { delegatingChatRepository } from '../repository/delegatingChatRepository';
import type { ChatConversationId, ChatDomainMessage } from '../domain/types';

export async function fetchConversationMessages(
  conversationId: ChatConversationId,
): Promise<ChatDomainMessage[]> {
  const rows = await delegatingChatRepository.getMessages(conversationId);
  void chatService.syncConversationMessages(conversationId, {}).catch(() => {});
  return rows;
}
