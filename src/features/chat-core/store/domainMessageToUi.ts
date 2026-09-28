/**
 * F5.3 — Domain Store → ChatMessage (UI legado).
 */

import type { ChatMessage } from '@/services/chat';
import type { ChatDomainMessage } from '../domain/types';

export function domainMessageToUi(message: ChatDomainMessage): ChatMessage {
  if (message.raw && typeof message.raw === 'object') {
    const raw = message.raw as ChatMessage;
    if (typeof raw.id === 'string') {
      return {
        ...raw,
        id: message.id,
        conversation_id: message.conversationId,
        direction: message.direction,
        body: message.body ?? raw.body ?? null,
        status: message.status ?? raw.status ?? null,
        sent_at: message.sentAt ?? raw.sent_at ?? raw.created_at ?? null,
      };
    }
  }

  return {
    id: message.id,
    conversation_id: message.conversationId,
    direction: message.direction,
    body: message.body,
    status: message.status,
    sent_at: message.sentAt,
    external_message_id: message.externalMessageId,
    client_message_id: message.clientMessageId,
  } as ChatMessage;
}
