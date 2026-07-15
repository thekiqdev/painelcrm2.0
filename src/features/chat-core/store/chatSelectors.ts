/**
 * F5.4 — selectors do Chat Principal (read-only).
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from './types';
import { selectConversationById as selectDomainConversationById } from './conversationSelectors';
import { selectConversationsForUi } from './conversationSelectors';
import {
  selectConversationMessages,
  selectMessageCount,
  selectMessageLoading,
  selectMessagesForUi,
} from './messageSelectors';
import { selectSelectedConversation } from './selectors';
import type { ChatConversation } from '@/services/chat';
import { auditLogSelector } from './f5HydrationAudit';

export function selectConversationById(
  state: ChatDomainState,
  id: ChatConversationId,
) {
  return selectDomainConversationById(state, id);
}

export function selectCurrentConversation(
  state: ChatDomainState,
  conversationId: ChatConversationId | null,
): ChatConversation | null {
  if (!conversationId) return null;
  const domain = selectDomainConversationById(state, conversationId);
  if (!domain) return null;
  return selectConversationsForUi(state).find((c) => c.id === conversationId) ?? null;
}

export { selectConversationMessages };

export function selectConversationLoading(
  state: ChatDomainState,
  conversationId: ChatConversationId | null,
): boolean {
  if (state.loading.conversations) return true;
  if (!conversationId) return false;
  return selectMessageLoading(state, conversationId);
}

export function selectConversationUnread(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): number {
  return state.unread.byConversationId[conversationId] ?? 0;
}

export function selectConversationCount(state: ChatDomainState): number {
  return state.conversations.orderedIds.length;
}

export function selectConversationOrder(state: ChatDomainState): readonly ChatConversationId[] {
  return state.conversations.orderedIds;
}

export function selectSelectedConversationForUi(state: ChatDomainState): ChatConversation | null {
  const selected = selectSelectedConversation(state);
  if (!selected) return null;
  return selectCurrentConversation(state, selected.id);
}

export function selectHasMoreMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  if (conversationId in state.messages.hasMoreByConversationId) {
    return state.messages.hasMoreByConversationId[conversationId] === true;
  }
  // Fallback F5: cursor string em lastLoadedCursor
  const cursor = state.messages.lastLoadedCursorByConversationId[conversationId];
  return typeof cursor === 'string' && cursor.length > 0;
}

export { selectMessageLoading as selectMessagesLoading };

export function selectChatMessagesForUi(
  state: ChatDomainState,
  conversationId: ChatConversationId | null,
) {
  if (!conversationId) return [];
  return selectMessagesForUi(state, conversationId);
}

export function selectChatConversationsForUi(state: ChatDomainState): ChatConversation[] {
  const rows = selectConversationsForUi(state);
  auditLogSelector(rows.length);
  return rows;
}

export { selectMessageCount };
