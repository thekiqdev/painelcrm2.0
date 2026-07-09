/**
 * F5.1 — repository delegado (chat-core interno).
 * Não substitui `src/repositories/*` — usado apenas pelo shadow Chat Core.
 */

import { chatService } from '@/services/chat';
import type {
  ChatAttendanceCounts,
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatInboxScope,
  ChatInstanceId,
} from '../domain/types';
import {
  mapLegacyConversationToDomain,
  mapLegacyInstanceToDomain,
  mapLegacyMessageToDomain,
} from '../store/domainMappers';
import { recordChatHttpRequest } from '../metrics/baseline';
import type { ChatRepository } from './chatRepository';

export function createDelegatingChatRepository(): ChatRepository {
  return {
    async listInstances(): Promise<ChatDomainInstance[]> {
      recordChatHttpRequest({ endpoint: '/api/chat/instances', method: 'GET', source: 'core_delegating_repo' });
      const rows = await chatService.listInstances();
      return rows.map(mapLegacyInstanceToDomain);
    },

  async getConversations(params: {
    instanceIds?: ChatInstanceId[];
    inboxScope: ChatInboxScope;
    attendanceFilter?: 'mine' | 'queue' | 'team' | 'closed' | '';
  }): Promise<ChatDomainConversation[]> {
      recordChatHttpRequest({
        endpoint: '/api/chat/conversations',
        method: 'GET',
        source: 'core_delegating_repo',
      });
      const rows: Awaited<ReturnType<typeof chatService.getConversations>> = [];
      const ids = params.instanceIds ?? [];
      const base = {
        inboxScope: params.inboxScope,
        attendanceFilter: params.attendanceFilter || undefined,
      };
      if (ids.length === 0) {
        const data = await chatService.getConversations(base);
        rows.push(...data);
      } else {
        for (const instanceId of ids) {
          const data = await chatService.getConversations({
            instanceId,
            ...base,
          });
          rows.push(...data);
        }
      }
      const byId = new Map<string, ChatDomainConversation>();
      for (const row of rows) {
        const mapped = mapLegacyConversationToDomain(row);
        byId.set(mapped.id, mapped);
      }
      return [...byId.values()];
    },

    async getMessages(conversationId: ChatConversationId): Promise<ChatDomainMessage[]> {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/messages`,
        method: 'GET',
        source: 'core_delegating_repo',
        conversationId,
      });
      const rows = await chatService.getConversationMessages(conversationId);
      return rows.map(mapLegacyMessageToDomain);
    },

    async syncMessages(conversationId: ChatConversationId): Promise<void> {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/messages/sync`,
        method: 'POST',
        source: 'core_delegating_repo',
        conversationId,
      });
      await chatService.syncConversationMessages(conversationId);
    },

    async markConversationRead(conversationId: ChatConversationId): Promise<void> {
      recordChatHttpRequest({
        endpoint: `/api/chat/conversations/${conversationId}/mark-read`,
        method: 'POST',
        source: 'core_delegating_repo',
        conversationId,
      });
      await chatService.markConversationRead(conversationId);
    },

    async getAttendanceCounts(params: {
      instanceIds: ChatInstanceId[];
      inboxScope: ChatInboxScope;
    }): Promise<ChatAttendanceCounts> {
      recordChatHttpRequest({
        endpoint: '/api/chat/conversations/attendance-counts',
        method: 'GET',
        source: 'core_delegating_repo',
      });
      const counts = await chatService.getConversationAttendanceCounts({
        instanceIds: params.instanceIds,
        inboxScope: params.inboxScope,
      });
      return {
        queue: counts.queue ?? 0,
        mine: counts.mine ?? 0,
        team: counts.team ?? 0,
        unassigned: counts.unassigned ?? 0,
        closed: counts.closed ?? 0,
        unread: counts.unread ?? 0,
      };
    },

    async sendText(conversationId: ChatConversationId, body: string): Promise<ChatDomainMessage> {
      recordChatHttpRequest({
        endpoint: '/api/chat/messages',
        method: 'POST',
        source: 'core_delegating_repo',
        conversationId,
      });
      const result = await chatService.sendMessage(conversationId, body);
      const row =
        result && typeof result === 'object' && 'message' in result && result.message
          ? result.message
          : (result as import('@/services/chat').ChatMessage);
      if (!row || typeof row !== 'object') {
        throw new Error('Resposta vazia ao enviar mensagem');
      }
      return mapLegacyMessageToDomain(row);
    },
  };
}

export const delegatingChatRepository = createDelegatingChatRepository();
