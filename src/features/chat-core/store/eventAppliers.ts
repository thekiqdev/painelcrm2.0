/**
 * F5.1 — aplica ChatDomainEvent ao Domain Store (shadow).
 */

import { adaptLegacyChatMessage, adaptLegacyConversation } from '../domain/adapters';
import type { ChatDomainEvent } from '../domain/types';
import { chatDomainActionCreators } from './actions';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from './domainMappers';
import type { ChatDomainAction } from './types';

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function pickConversationPatch(payload: unknown) {
  const raw = asRecord(payload);
  const conversation = raw.conversation ?? raw;
  try {
    return mapLegacyConversationToDomain(adaptLegacyConversation(conversation));
  } catch {
    const id =
      typeof raw.id === 'string'
        ? raw.id
        : typeof raw.conversation_id === 'string'
          ? raw.conversation_id
          : null;
    if (!id) return null;
    return {
      id,
      instanceId: null,
      channel: 'uazapi' as const,
      unreadCount: typeof raw.unread_count === 'number' ? raw.unread_count : 0,
      lastMessageAt:
        typeof raw.last_message_at === 'string'
          ? raw.last_message_at
          : typeof raw.lastMessageAt === 'string'
            ? raw.lastMessageAt
            : null,
      lastMessagePreview:
        typeof raw.last_message_preview === 'string'
          ? raw.last_message_preview
          : typeof raw.lastMessagePreview === 'string'
            ? raw.lastMessagePreview
            : null,
      contactName: null,
      phoneNumber: null,
      attendanceStatus: null,
      assignedToUserId: null,
      clientId: null,
      leadId: null,
      conversationType: null,
      raw: conversation,
    };
  }
}

function pickMessageFromPayload(payload: unknown) {
  const raw = asRecord(payload);
  const message = raw.message ?? payload;
  try {
    return mapLegacyMessageToDomain(adaptLegacyChatMessage(message));
  } catch {
    return null;
  }
}

/** Converte evento WS normalizado em actions do store. */
export function mapDomainEventToActions(event: ChatDomainEvent): ChatDomainAction[] {
  switch (event.kind) {
    case 'message.created': {
      const message = pickMessageFromPayload(event.payload);
      if (!message) return [];
      return [chatDomainActionCreators.appendMessage(message.conversationId, message)];
    }
    case 'message.updated':
    case 'message.read':
    case 'message.delivered':
    case 'message.failed': {
      const message = pickMessageFromPayload(event.payload);
      if (!message) return [];
      const status =
        event.kind === 'message.read'
          ? 'read'
          : event.kind === 'message.delivered'
            ? 'delivered'
            : event.kind === 'message.failed'
              ? 'failed'
              : message.status;
      return [
        chatDomainActionCreators.updateMessage(message.conversationId, message.id, {
          ...message,
          status: status ?? message.status,
        }),
      ];
    }
    case 'message.deleted': {
      const message = pickMessageFromPayload(event.payload);
      const conversationId = message?.conversationId ?? event.conversationId;
      const messageId = message?.id ?? event.messageId;
      if (!conversationId || !messageId) return [];
      return [chatDomainActionCreators.removeMessage(conversationId, messageId)];
    }
    case 'conversation.updated':
    case 'conversation.attendance_updated': {
      const conversation = pickConversationPatch(event.payload);
      if (!conversation) return [];
      return [{ type: 'conversations/upsert' as const, conversation }];
    }
    case 'conversation.deleted': {
      const id = event.conversationId;
      if (!id) return [];
      return [{ type: 'conversations/remove' as const, conversationId: id }];
    }
    default:
      return [];
  }
}
