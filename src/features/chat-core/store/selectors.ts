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
import { timeSelector } from '../metrics/selectorMetrics';

export function selectConversation(
  state: ChatDomainState,
  id: ChatConversationId,
): ChatDomainConversation | null {
  return timeSelector('selectConversation', () => state.conversations.byId[id] ?? null);
}

export function selectConversations(state: ChatDomainState): readonly ChatDomainConversation[] {
  return timeSelector('selectConversations', () =>
    state.conversations.orderedIds
      .map((id) => state.conversations.byId[id])
      .filter((c): c is ChatDomainConversation => Boolean(c)),
  );
}

export function selectMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): readonly ChatDomainMessage[] {
  return timeSelector('selectMessages', () => {
    const ids = state.messages.byConversationId[conversationId] ?? [];
    return ids
      .map((id) => state.messages.byId[id])
      .filter(
        (m): m is ChatDomainMessage => Boolean(m) && typeof m.id === 'string' && m.id.length > 0,
      );
  });
}

export function selectUnread(state: ChatDomainState): UnreadState {
  return timeSelector('selectUnread', () => state.unread);
}

export function selectSelectedConversation(state: ChatDomainState): ChatDomainConversation | null {
  return timeSelector('selectSelectedConversation', () => {
    const id = state.selection.selectedConversationId;
    if (!id) return null;
    return state.conversations.byId[id] ?? null;
  });
}

export function selectConnection(state: ChatDomainState): ConnectionState {
  return timeSelector('selectConnection', () => state.connection);
}

export function selectInstances(state: ChatDomainState): readonly ChatDomainInstance[] {
  return timeSelector('selectInstances', () =>
    state.instances.orderedIds
      .map((id) => state.instances.byId[id])
      .filter((i): i is ChatDomainInstance => Boolean(i)),
  );
}

export function selectLoadingConversations(state: ChatDomainState): boolean {
  return timeSelector('selectLoadingConversations', () => state.loading.conversations);
}

/** Alias F5.12 — loading de mensagens por conversa. */
export function selectLoadingMessages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  return timeSelector(
    'selectLoadingMessages',
    () => state.loading.messages[conversationId] === true,
  );
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
