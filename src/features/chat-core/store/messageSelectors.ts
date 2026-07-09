/**
 * F5.3 — selectors de mensagens para Floating Chat.
 */

import type { ChatConversationId, ChatDomainMessage, ChatMessageId } from '../domain/types';
import type { ChatDomainState } from './types';
import { selectMessages as selectRawMessages } from './selectors';
import { domainMessageToUi } from './domainMessageToUi';
import type { ChatMessage } from '@/services/chat';

export function sortDomainMessages(
  list: readonly ChatDomainMessage[],
): ChatDomainMessage[] {
  return [...list]
    .filter((m): m is ChatDomainMessage => typeof m?.id === 'string' && m.id.length > 0)
    .sort((a, b) => {
      const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      const validTa = Number.isFinite(ta) && ta > 0 ? ta : 0;
      const validTb = Number.isFinite(tb) && tb > 0 ? tb : 0;
      if (validTa && validTb) return validTa - validTb;
      if (validTa && !validTb) return -1;
      if (!validTa && validTb) return 1;
      return a.id.localeCompare(b.id);
    });
}

export function selectMessage(
  state: ChatDomainState,
  messageId: ChatMessageId,
): ChatDomainMessage | null {
  return state.messages.byId[messageId] ?? null;
}

export function selectConversationMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): readonly ChatDomainMessage[] {
  return sortDomainMessages(selectRawMessages(state, conversationId));
}

/** Alias documental — lista de mensagens de domínio por conversa. */
export function selectMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): readonly ChatDomainMessage[] {
  return selectConversationMessages(state, conversationId);
}

export function selectLastMessage(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ChatDomainMessage | null {
  const list = selectConversationMessages(state, conversationId);
  return list.length > 0 ? list[list.length - 1]! : null;
}

export function selectMessageCount(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): number {
  return state.messages.byConversationId[conversationId]?.length ?? 0;
}

export function selectMessageLoading(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  return state.loading.messages[conversationId] === true;
}

export function selectMessageVersion(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): number {
  return state.messages.versionByConversationId[conversationId] ?? 0;
}

export function selectMessagesForUi(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ChatMessage[] {
  return selectConversationMessages(state, conversationId).map(domainMessageToUi);
}
