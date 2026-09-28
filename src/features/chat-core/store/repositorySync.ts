/**
 * F5.1 — sincronização Repository → Domain Store (shadow).
 */

import type { ChatInstance } from '@/services/chat';
import type { ChatAttendanceCounts, ChatDomainConversation, ChatDomainMessage } from '../domain/types';
import { chatDomainActionCreators } from './actions';
import {
  mapLegacyConversationToDomain,
  mapLegacyInstanceToDomain,
  mapLegacyMessageToDomain,
} from './domainMappers';
import type { ChatDomainAction } from './types';

function isDomainConversation(payload: unknown): payload is ChatDomainConversation {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'id' in payload &&
      'unreadCount' in payload &&
      !('conversationId' in payload),
  );
}

function isDomainMessage(payload: unknown): payload is ChatDomainMessage {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'conversationId' in payload &&
      'direction' in payload,
  );
}

function toDomainConversation(payload: unknown): ChatDomainConversation {
  if (isDomainConversation(payload)) return payload;
  return mapLegacyConversationToDomain(
    payload as Parameters<typeof mapLegacyConversationToDomain>[0],
  );
}

function toDomainMessage(payload: unknown): ChatDomainMessage {
  if (isDomainMessage(payload)) return payload;
  return mapLegacyMessageToDomain(payload as Parameters<typeof mapLegacyMessageToDomain>[0]);
}

export { toDomainMessage, toDomainConversation, isDomainMessage, isDomainConversation };

export type RepositorySyncSource =
  | 'listInstances'
  | 'listConversations'
  | 'getConversation'
  | 'listMessages'
  | 'getMessages'
  | 'attendanceCounts'
  | 'sendText'
  | 'markRead'
  | 'syncMessages'
  | 'unknown';

export function mapRepositoryResponseToActions(
  source: RepositorySyncSource,
  payload: unknown,
): ChatDomainAction[] {
  switch (source) {
    case 'listInstances': {
      if (!Array.isArray(payload)) return [];
      const instances = (payload as ChatInstance[]).map(mapLegacyInstanceToDomain);
      return [{ type: 'instances/set', instances }];
    }
    case 'listConversations':
    case 'getConversation': {
      if (Array.isArray(payload)) {
        const conversations = payload.map((row) =>
          mapLegacyConversationToDomain(row as Parameters<typeof mapLegacyConversationToDomain>[0]),
        );
        return [chatDomainActionCreators.setConversations(conversations)];
      }
      if (payload && typeof payload === 'object') {
        const conversation = toDomainConversation(payload);
        return [{ type: 'conversations/upsert', conversation }];
      }
      return [];
    }
    case 'listMessages':
    case 'getMessages': {
      if (!Array.isArray(payload) || payload.length === 0) return [];
      const messages = payload.map((row) => toDomainMessage(row));
      const conversationId = messages[0]?.conversationId;
      if (!conversationId) return [];
      return [chatDomainActionCreators.setMessages(conversationId, messages)];
    }
    case 'attendanceCounts': {
      if (!payload || typeof payload !== 'object') return [];
      return [
        chatDomainActionCreators.setUnread({
          attendance: payload as ChatAttendanceCounts,
          lastReconciledAt: Date.now(),
        }),
      ];
    }
    case 'sendText': {
      if (!payload || typeof payload !== 'object') return [];
      const message = toDomainMessage(payload);
      if (!message.conversationId) return [];
      return [chatDomainActionCreators.appendMessage(message.conversationId, message)];
    }
    case 'markRead': {
      const conversationId =
        typeof payload === 'string'
          ? payload
          : payload && typeof payload === 'object' && 'conversationId' in payload
            ? String((payload as { conversationId: string }).conversationId)
            : null;
      if (!conversationId) return [];
      return [
        chatDomainActionCreators.setUnread({
          byConversationId: { [conversationId]: 0 },
        }),
      ];
    }
    default:
      return [];
  }
}
