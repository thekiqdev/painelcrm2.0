/**
 * F6.0 / F6.5 — hook de cursor com selector estável.
 */

import { shouldUseChatDomainStore } from '../flags';
import {
  selectConversationCanLoadMore,
  selectConversationCursor,
  type ConversationCursorState,
} from '../cursorSelectors';
import { useStableSelector } from './useStableSelector';
import { shallowEqual } from '../selectorMemo';

export type UseConversationCursorResult = ConversationCursorState & {
  canLoadMore: boolean;
  enabled: boolean;
};

type CursorSlice = ConversationCursorState & { canLoadMore: boolean };

export function useConversationCursor(
  conversationId: string | null | undefined,
): UseConversationCursorResult {
  const useStore = shouldUseChatDomainStore() && Boolean(conversationId);

  const slice = useStableSelector(
    (state): CursorSlice => {
      if (!conversationId) {
        return {
          cursor: null,
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
          loadingMore: false,
          loadedPages: 0,
          canLoadMore: false,
        };
      }
      return {
        ...selectConversationCursor(state, conversationId),
        canLoadMore: selectConversationCanLoadMore(state, conversationId),
      };
    },
    {
      enabled: useStore,
      name: 'useConversationCursor',
      equalityFn: shallowEqual,
      trackSubscription: false,
    },
  );

  if (!useStore || !conversationId) {
    return {
      cursor: null,
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      loadingMore: false,
      loadedPages: 0,
      canLoadMore: false,
      enabled: false,
    };
  }

  return {
    ...slice,
    enabled: true,
  };
}
