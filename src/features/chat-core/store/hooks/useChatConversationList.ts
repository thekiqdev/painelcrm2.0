/**
 * F5.4 / F6.5 — lista de conversas do Chat Principal (selector estável).
 */

import type { ChatConversation } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import { selectChatConversationsForUi } from '../chatSelectors';
import { selectLoadingConversations } from '../selectors';
import type { ChatRenderSource } from '../chatMetrics';
import { auditLogHook } from '../f5HydrationAudit';
import { useStableSelector } from './useStableSelector';
import { conversationsUiEqual } from '../selectorMemo';

export type ChatConversationListData = {
  conversations: ChatConversation[];
  isLoading: boolean;
  isSyncing: boolean;
  source: ChatRenderSource;
};

type ConversationListSlice = {
  conversations: ChatConversation[];
  loadingConversations: boolean;
};

function conversationListEqual(a: ConversationListSlice, b: ConversationListSlice): boolean {
  return (
    a.loadingConversations === b.loadingConversations &&
    conversationsUiEqual(a.conversations, b.conversations)
  );
}

export function useChatConversationList(params: {
  enabled?: boolean;
  repositoryLoading?: boolean;
  repositorySyncing?: boolean;
}): ChatConversationListData {
  const useStore = (params.enabled ?? true) && shouldUseChatDomainStore();

  const slice = useStableSelector(
    (state): ConversationListSlice => ({
      conversations: selectChatConversationsForUi(state),
      loadingConversations: selectLoadingConversations(state),
    }),
    {
      enabled: useStore,
      name: 'useChatConversationList',
      equalityFn: conversationListEqual,
    },
  );

  if (!useStore) {
    auditLogHook(0, 'react-query');
    return {
      conversations: [],
      isLoading: Boolean(params.repositoryLoading),
      isSyncing: Boolean(params.repositorySyncing),
      source: 'react-query',
    };
  }

  auditLogHook(slice.conversations.length, 'store');
  return {
    conversations: slice.conversations,
    isLoading: slice.loadingConversations || Boolean(params.repositoryLoading),
    isSyncing: Boolean(params.repositorySyncing),
    source: 'store',
  };
}
