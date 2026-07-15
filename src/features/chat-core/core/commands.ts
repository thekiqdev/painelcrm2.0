/**
 * F5.5 — comandos de domínio com optimistic → HTTP → confirm/rollback.
 */

import type { ChatConversationId, ChatDomainMessage, ChatInboxScope, ChatInstanceId } from '../domain/types';
import { delegatingChatRepository } from '../repository/delegatingChatRepository';
import { syncStoreFromCommandResult, syncStoreFromRepositoryResponse } from '../store/integration';
import { shouldUseChatDomainStore } from '../store/flags';
import { isChatPhaseFlagEnabled } from '../feature-flags';
import { chatRepository } from '../repository/chatRepository';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from '../store/domainMappers';
import { getChatDomainStoreSession } from '../store/session';
import { chatDomainActionCreators } from '../store/actions';
import {
  applyOptimisticConversationPatch,
  applyOptimisticMarkConversationRead,
  applyOptimisticMarkMessageRead,
  applyOptimisticPin,
  applyOptimisticRemoveConversation,
  applyOptimisticSendMessage,
  applyOptimisticSendMessagePreApplied,
} from '../store/optimistic';
import { executeChatCommand, mapLegacyConversationResult } from './commandDispatcher';
import { loadInboxCommand, clearInboxCommand } from './loadInbox';
import { loadMessagesCommand, openConversationMessagesCommand } from './loadMessages';
import {
  loadMessagesCursorCommand,
  resetConversationCursorCommand,
} from './loadMessagesCursor';

export {
  loadInboxCommand,
  clearInboxCommand,
  type LoadInboxParams,
  type LoadInboxResult,
  type LoadInboxSurface,
} from './loadInbox';
export {
  loadMessagesCommand,
  openConversationMessagesCommand,
  type LoadMessagesResult,
  type LoadMessagesCommandOptions,
} from './loadMessages';
export {
  loadMessagesCursorCommand,
  resetConversationCursorCommand,
  type LoadMessagesCursorParams,
  type LoadMessagesCursorResult,
} from './loadMessagesCursor';
export {
  DEFAULT_MESSAGES_PAGE_SIZE,
  type GetMessagesPageParams,
  type MessagesPageResult,
} from './messagesPageFetch';

function useShadowStore(): boolean {
  return isChatPhaseFlagEnabled('CHAT_CORE_STORE') && shouldUseChatDomainStore();
}

function activeRepository() {
  return useShadowStore() ? delegatingChatRepository : chatRepository;
}

export async function sendMessageCommand(
  conversationId: ChatConversationId,
  body: string,
  options?: {
    replyToMessageId?: string;
    clientMessageId?: string;
    optimisticId?: string;
  },
): Promise<ChatDomainMessage> {
  const optimisticId = options?.optimisticId ?? `optimistic-${options?.clientMessageId ?? crypto.randomUUID()}`;
  const optimisticMessage: ChatDomainMessage = {
    id: optimisticId,
    conversationId,
    direction: 'outgoing',
    body,
    status: 'sending',
    sentAt: new Date().toISOString(),
    externalMessageId: null,
    clientMessageId: options?.clientMessageId ?? null,
    raw: { optimistic: true, client_message_id: options?.clientMessageId },
  };

  return executeChatCommand({
    command: 'sendMessage',
    conversationId,
    applyOptimistic: () =>
      options?.optimisticId
        ? applyOptimisticSendMessagePreApplied(conversationId, options.optimisticId)
        : applyOptimisticSendMessage(conversationId, optimisticMessage),
    execute: async () => {
      if (options?.clientMessageId || options?.replyToMessageId) {
        const { chatService } = await import('@/services/chat');
        const { message } = await chatService.sendMessage(conversationId, body, {
          replyToMessageId: options.replyToMessageId,
          clientMessageId: options.clientMessageId,
        });
        if (!message) throw new Error('Resposta vazia ao enviar mensagem');
        return mapLegacyMessageToDomain(message);
      }
      return activeRepository().sendText(conversationId, body);
    },
    mapConfirmPayload: (result) => result,
  });
}

export async function markAsReadCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'markConversationRead',
    conversationId,
    applyOptimistic: () => applyOptimisticMarkConversationRead(conversationId),
    execute: async () => {
      await activeRepository().markConversationRead(conversationId);
    },
    mapConfirmPayload: () => ({ conversationId }),
  });
}

export async function markConversationReadCommand(conversationId: ChatConversationId): Promise<void> {
  return markAsReadCommand(conversationId);
}

export async function markMessageReadCommand(
  conversationId: ChatConversationId,
  messageId: string,
): Promise<void> {
  await executeChatCommand({
    command: 'markMessageRead',
    conversationId,
    applyOptimistic: () => applyOptimisticMarkMessageRead(conversationId, messageId),
    execute: async () => {
      await activeRepository().markConversationRead(conversationId);
    },
    mapConfirmPayload: () => ({ conversationId, messageId }),
  });
}

export async function assignConversationCommand(
  conversationId: ChatConversationId,
  body: { assignedToUserId: string; reason?: string },
): Promise<void> {
  await executeChatCommand({
    command: 'assignConversation',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('assignConversation', conversationId, {
        assignedToUserId: body.assignedToUserId,
        attendanceStatus: 'in_progress',
      }),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return chatService.patchConversationAttendance(conversationId, {
        action: 'reassign',
        toUserId: body.assignedToUserId,
        reason: body.reason,
      });
    },
    mapConfirmPayload: mapLegacyConversationResult,
  });
}

export async function transferConversationCommand(
  conversationId: ChatConversationId,
  body: { toUserId?: string; toTeamId?: string; reason?: string },
): Promise<void> {
  await executeChatCommand({
    command: 'transferConversation',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('transferConversation', conversationId, {
        assignedToUserId: body.toUserId ?? null,
        attendanceStatus: body.toTeamId ? 'queue' : 'in_progress',
      }),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return body.toTeamId
        ? chatService.transferConversation(conversationId, {
            toTeamId: body.toTeamId,
            reason: body.reason,
          })
        : chatService.transferConversation(conversationId, {
            toUserId: body.toUserId!,
            reason: body.reason,
          });
    },
    mapConfirmPayload: mapLegacyConversationResult,
  });
}

export async function closeConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'closeConversation',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('closeConversation', conversationId, {
        attendanceStatus: 'closed',
        assignedToUserId: null,
      }),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return chatService.patchConversationAttendance(conversationId, { action: 'close' });
    },
    mapConfirmPayload: mapLegacyConversationResult,
  });
}

export async function archiveConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'archiveConversation',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('archiveConversation', conversationId, {
        attendanceStatus: 'archived',
      }),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return chatService.patchConversationAttendance(conversationId, { action: 'close' });
    },
    mapConfirmPayload: mapLegacyConversationResult,
  });
}

export async function reopenConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'reopenConversation',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('reopenConversation', conversationId, {
        attendanceStatus: 'in_progress',
      }),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return chatService.attendConversation(conversationId);
    },
    mapConfirmPayload: mapLegacyConversationResult,
  });
}

export async function deleteConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'deleteConversation',
    conversationId,
    applyOptimistic: () => applyOptimisticRemoveConversation(conversationId),
    execute: async () => {
      const { chatService } = await import('@/services/chat');
      return chatService.systemDeleteConversation(conversationId);
    },
    mapConfirmPayload: (result) => result,
  });
}

export async function pinConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'pinConversation',
    conversationId,
    applyOptimistic: () => applyOptimisticPin(conversationId, true),
    execute: async () => {
      const store = getChatDomainStoreSession();
      return store?.getState().conversations.byId[conversationId] ?? { id: conversationId };
    },
    mapConfirmPayload: (result) => result,
  });
}

export async function unpinConversationCommand(conversationId: ChatConversationId): Promise<void> {
  await executeChatCommand({
    command: 'unpinConversation',
    conversationId,
    applyOptimistic: () => applyOptimisticPin(conversationId, false),
    execute: async () => {
      const store = getChatDomainStoreSession();
      return store?.getState().conversations.byId[conversationId] ?? { id: conversationId };
    },
    mapConfirmPayload: (result) => result,
  });
}

export async function updateConversationStatusCommand(
  conversationId: ChatConversationId,
  status: string,
): Promise<void> {
  await executeChatCommand({
    command: 'updateConversationStatus',
    conversationId,
    applyOptimistic: () =>
      applyOptimisticConversationPatch('updateConversationStatus', conversationId, {
        attendanceStatus: status,
      }),
    execute: async () => {
      const store = getChatDomainStoreSession();
      return store?.getState().conversations.byId[conversationId] ?? { id: conversationId, attendanceStatus: status };
    },
    mapConfirmPayload: (result) => result,
  });
}

/** Namespace de commands para a UI (F5.5 / F5.9 / F5.10). */
export const chatCoreCommands = {
  loadInbox: loadInboxCommand,
  clearInbox: clearInboxCommand,
  loadMessages: loadMessagesCommand,
  loadMessagesCursor: loadMessagesCursorCommand,
  resetConversationCursor: resetConversationCursorCommand,
  sendMessage: sendMessageCommand,
  markMessageRead: markMessageReadCommand,
  markConversationRead: markConversationReadCommand,
  assignConversation: assignConversationCommand,
  transferConversation: transferConversationCommand,
  archiveConversation: archiveConversationCommand,
  closeConversation: closeConversationCommand,
  reopenConversation: reopenConversationCommand,
  deleteConversation: deleteConversationCommand,
  pinConversation: pinConversationCommand,
  unpinConversation: unpinConversationCommand,
  updateConversationStatus: updateConversationStatusCommand,
};
