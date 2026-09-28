/**
 * F5.5 — bridge UI → Chat Core commands (flag ON) ou legado (flag OFF).
 */

import { isChatPhaseFlagEnabled } from '../feature-flags';
import { shouldUseChatDomainStore } from '../store/flags';
import {
  chatCoreCommands,
  closeConversationCommand,
  deleteConversationCommand,
  markConversationReadCommand,
  reopenConversationCommand,
  sendMessageCommand,
  transferConversationCommand,
} from './commands';
import { chatService } from '@/services/chat';
import type { ChatMessage } from '@/services/chat';

function useStoreCommands(): boolean {
  return isChatPhaseFlagEnabled('CHAT_CORE_STORE') && shouldUseChatDomainStore();
}

export async function bridgeMarkConversationRead(conversationId: string, read = true): Promise<void> {
  if (useStoreCommands() && read) {
    await markConversationReadCommand(conversationId);
    return;
  }
  await chatService.markConversationRead(conversationId, read);
}

export async function bridgeSendMessage(
  conversationId: string,
  text: string,
  options?: { replyToMessageId?: string; clientMessageId?: string; optimisticId?: string },
): Promise<{ message?: ChatMessage; response?: unknown; duplicate?: boolean }> {
  if (useStoreCommands()) {
    const domain = await sendMessageCommand(conversationId, text, options);
    const raw = domain.raw as ChatMessage | undefined;
    const message: ChatMessage =
      raw && typeof raw.id === 'string'
        ? {
            ...raw,
            id: domain.id || raw.id,
            conversation_id: domain.conversationId || raw.conversation_id,
            status: domain.status ?? raw.status ?? 'sent',
          }
        : ({
            id: domain.id,
            conversation_id: domain.conversationId,
            body: domain.body ?? '',
            direction: domain.direction,
            status: domain.status ?? 'sent',
            sent_at: domain.sentAt ?? undefined,
            client_message_id: domain.clientMessageId ?? undefined,
          } as ChatMessage);
    return { message };
  }
  return chatService.sendMessage(conversationId, text, options);
}

export async function bridgeCloseAttendance(conversationId: string): Promise<void> {
  if (useStoreCommands()) {
    await closeConversationCommand(conversationId);
    return;
  }
  await chatService.patchConversationAttendance(conversationId, { action: 'close' });
}

export async function bridgeAttendConversation(conversationId: string): Promise<void> {
  if (useStoreCommands()) {
    await reopenConversationCommand(conversationId);
    return;
  }
  await chatService.attendConversation(conversationId);
}

export async function bridgeTransferConversation(
  conversationId: string,
  body: { toUserId: string; reason?: string } | { toTeamId: string; reason?: string },
): Promise<void> {
  if (useStoreCommands()) {
    await transferConversationCommand(conversationId, body);
    return;
  }
  await chatService.transferConversation(conversationId, body);
}

export async function bridgeSystemDeleteConversation(conversationId: string): Promise<void> {
  if (useStoreCommands()) {
    await deleteConversationCommand(conversationId);
    return;
  }
  await chatService.systemDeleteConversation(conversationId);
}

export { chatCoreCommands };
