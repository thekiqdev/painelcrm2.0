/**
 * F5.0 — selectors puros do Domain Store.
 */

import type {
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatDomainState,
  ChatDomainSelectors,
  ConnectionState,
  UnreadState,
} from './types';

export function selectConversation(
  state: ChatDomainState,
  id: ChatConversationId,
): ChatDomainConversation | null {
  return state.conversations.byId[id] ?? null;
}

export function selectConversations(state: ChatDomainState): readonly ChatDomainConversation[] {
  return state.conversations.orderedIds
    .map((id) => state.conversations.byId[id])
    .filter((c): c is ChatDomainConversation => Boolean(c));
}

export function selectMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): readonly ChatDomainMessage[] {
  const ids = state.messages.byConversationId[conversationId] ?? [];
  return ids
    .map((id) => state.messages.byId[id])
    .filter((m): m is ChatDomainMessage => Boolean(m) && typeof m.id === 'string' && m.id.length > 0);
}

export function selectUnread(state: ChatDomainState): UnreadState {
  return state.unread;
}

export function selectSelectedConversation(state: ChatDomainState): ChatDomainConversation | null {
  const id = state.selection.selectedConversationId;
  if (!id) return null;
  return selectConversation(state, id);
}

export function selectConnection(state: ChatDomainState): ConnectionState {
  return state.connection;
}

export function selectInstances(state: ChatDomainState): readonly ChatDomainInstance[] {
  return state.instances.orderedIds
    .map((id) => state.instances.byId[id])
    .filter((i): i is ChatDomainInstance => Boolean(i));
}

export function selectLoadingConversations(state: ChatDomainState): boolean {
  return state.loading.conversations;
}

export const chatDomainSelectors: ChatDomainSelectors = {
  selectConversation,
  selectConversations,
  selectMessages,
  selectUnread,
  selectSelectedConversation,
  selectConnection,
  selectInstances,
  selectLoadingConversations,
};
