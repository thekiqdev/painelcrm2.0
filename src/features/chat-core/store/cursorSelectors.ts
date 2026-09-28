/**
 * F6.0 — selectors de cursor / paginação de mensagens.
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from './types';
import { timeSelector } from '../metrics/selectorMetrics';

export type ConversationCursorState = {
  cursor: string | null;
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadedPages: number;
};

export function selectConversationCursor(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ConversationCursorState {
  return timeSelector('selectConversationCursor', () => ({
    cursor: state.messages.cursorByConversationId[conversationId] ?? null,
    nextCursor: state.messages.nextCursorByConversationId[conversationId] ?? null,
    previousCursor: state.messages.previousCursorByConversationId[conversationId] ?? null,
    hasMore: state.messages.hasMoreByConversationId[conversationId] ?? false,
    loadingMore: state.messages.loadingMoreByConversationId[conversationId] ?? false,
    loadedPages: state.messages.loadedPagesByConversationId[conversationId] ?? 0,
  }));
}

export function selectConversationHasMore(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  return timeSelector(
    'selectConversationHasMore',
    () => state.messages.hasMoreByConversationId[conversationId] ?? false,
  );
}

export function selectConversationLoadingMore(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  return timeSelector(
    'selectConversationLoadingMore',
    () => state.messages.loadingMoreByConversationId[conversationId] ?? false,
  );
}

export function selectConversationLoadedPages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): number {
  return timeSelector(
    'selectConversationLoadedPages',
    () => state.messages.loadedPagesByConversationId[conversationId] ?? 0,
  );
}

export function selectConversationCanLoadMore(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): boolean {
  return timeSelector('selectConversationCanLoadMore', () => {
    const hasMore = state.messages.hasMoreByConversationId[conversationId] ?? false;
    const loading = state.messages.loadingMoreByConversationId[conversationId] ?? false;
    return hasMore && !loading;
  });
}
