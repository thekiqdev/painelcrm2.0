/**
 * Chat Repository — esqueleto F0.
 *
 * Wrapper tipado sobre o futuro acesso HTTP. Em F0 **não** chama a API
 * e **não** substitui `@/services/chat`. F4/F5 passarão a delegar aqui.
 */

import type {
  ChatAttendanceCounts,
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatInboxScope,
  ChatInstanceId,
} from '../domain/types';
import { ChatCoreNotWiredError } from '../domain/public-api';
import { recordChatHttpRequest } from '../metrics/baseline';

export type ChatRepository = {
  listInstances(): Promise<ChatDomainInstance[]>;
  getConversations(params: {
    instanceIds?: ChatInstanceId[];
    inboxScope: ChatInboxScope;
    attendanceFilter?: 'mine' | 'queue' | 'team' | 'closed' | 'wa_archived' | '';
  }): Promise<ChatDomainConversation[]>;
  getMessages(conversationId: ChatConversationId): Promise<ChatDomainMessage[]>;
  /** F6.0 — paginação por cursor (opcional; stubs podem omitir). */
  getMessagesPage?(params: {
    conversationId: ChatConversationId;
    cursor?: string | null;
    pageSize?: number;
  }): Promise<{
    messages: ChatDomainMessage[];
    nextCursor: string | null;
    previousCursor: string | null;
    hasMore: boolean;
    source: 'cursor' | 'legacy';
  }>;
  syncMessages(conversationId: ChatConversationId): Promise<void>;
  markConversationRead(conversationId: ChatConversationId): Promise<void>;
  getAttendanceCounts(params: {
    instanceIds: ChatInstanceId[];
    inboxScope: ChatInboxScope;
  }): Promise<ChatAttendanceCounts>;
  sendText(conversationId: ChatConversationId, body: string): Promise<ChatDomainMessage>;
};

function notWired(method: string): never {
  throw new ChatCoreNotWiredError(`repository.${method}`);
}

/**
 * Cria repository stub. Qualquer chamada HTTP registraria métrica
 * antes do throw — útil se testes F0 invocarem por engano.
 */
export function createChatRepository(): ChatRepository {
  return {
    async listInstances() {
      recordChatHttpRequest({ endpoint: '/api/chat/instances', method: 'GET', source: 'repository_stub' });
      return notWired('listInstances');
    },
    async getConversations() {
      recordChatHttpRequest({
        endpoint: '/api/chat/conversations',
        method: 'GET',
        source: 'repository_stub',
      });
      return notWired('getConversations');
    },
    async getMessages(conversationId) {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/messages`,
        method: 'GET',
        source: 'repository_stub',
      });
      return notWired('getMessages');
    },
    async syncMessages(conversationId) {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/messages/sync`,
        method: 'POST',
        source: 'repository_stub',
      });
      return notWired('syncMessages');
    },
    async markConversationRead(conversationId) {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/mark-read`,
        method: 'POST',
        source: 'repository_stub',
      });
      return notWired('markConversationRead');
    },
    async getAttendanceCounts() {
      recordChatHttpRequest({
        endpoint: '/api/chat/conversations/attendance-counts',
        method: 'GET',
        source: 'repository_stub',
      });
      return notWired('getAttendanceCounts');
    },
    async sendText(conversationId) {
      recordChatHttpRequest({
        endpoint: '/api/chat/messages',
        method: 'POST',
        source: 'repository_stub',
        conversationId,
      });
      return notWired('sendText');
    },
  };
}

export const chatRepository = createChatRepository();
