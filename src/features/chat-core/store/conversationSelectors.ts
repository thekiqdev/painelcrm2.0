/**
 * F5.2 — selectors de conversas para Floating Chat.
 */

import type { ChatConversationId, ChatDomainConversation, ChatDomainState } from './types';
import { selectConversations } from './selectors';
import { domainConversationToUi } from './domainToUi';
import type { ChatConversation } from '@/services/chat';

export type ConversationQuickFilter = 'all' | 'mine' | 'unread';

export type ConversationPreview = {
  conversationId: ChatConversationId;
  displayName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

function readPinned(conversation: ChatDomainConversation): boolean {
  const raw = conversation.raw as Record<string, unknown> | undefined;
  if (!raw) return false;
  if (typeof raw.pinned === 'boolean') return raw.pinned;
  const meta = raw.metadata;
  if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).pinned === 'boolean') {
    return Boolean((meta as Record<string, unknown>).pinned);
  }
  return false;
}

export function sortDomainConversations(
  list: readonly ChatDomainConversation[],
): ChatDomainConversation[] {
  return [...list].sort((a, b) => {
    const aPinned = readPinned(a);
    const bPinned = readPinned(b);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (ta && tb) return tb - ta;
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;

    const rawA = a.raw as { created_at?: string } | undefined;
    const rawB = b.raw as { created_at?: string } | undefined;
    const ca = rawA?.created_at ? new Date(rawA.created_at).getTime() : 0;
    const cb = rawB?.created_at ? new Date(rawB.created_at).getTime() : 0;
    return cb - ca;
  });
}

export function selectConversationById(
  state: ChatDomainState,
  id: ChatConversationId,
): ChatDomainConversation | null {
  return state.conversations.byId[id] ?? null;
}

export function selectConversationIds(state: ChatDomainState): readonly ChatConversationId[] {
  return selectConversationOrdering(state).map((c) => c.id);
}

export function selectConversationPreview(
  state: ChatDomainState,
  id: ChatConversationId,
): ConversationPreview | null {
  const conversation = selectConversationById(state, id);
  if (!conversation) return null;
  return {
    conversationId: conversation.id,
    displayName: conversation.contactName,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
  };
}

export function selectConversationOrdering(
  state: ChatDomainState,
  options?: { quickFilter?: ConversationQuickFilter },
): readonly ChatDomainConversation[] {
  let list = selectConversations(state);
  if (options?.quickFilter === 'unread') {
    list = list.filter((c) => c.unreadCount > 0);
  }
  return list;
}

export function selectConversationsForUi(
  state: ChatDomainState,
  options?: { quickFilter?: ConversationQuickFilter },
): ChatConversation[] {
  return selectConversationOrdering(state, options).map(domainConversationToUi);
}
