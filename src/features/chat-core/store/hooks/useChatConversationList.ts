/**
 * F5.4 — lista de conversas do Chat Principal (read-only via Domain Store).
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ChatConversation } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../session';
import { createInitialChatDomainState } from '../state';
import { selectChatConversationsForUi } from '../chatSelectors';
import { selectLoadingConversations } from '../selectors';
import type { ChatRenderSource } from '../chatMetrics';
import { auditLogHook } from '../f5HydrationAudit';
import { recordStoreSubscription } from '../consolidatedMetrics';

export type ChatConversationListData = {
  conversations: ChatConversation[];
  isLoading: boolean;
  isSyncing: boolean;
  source: ChatRenderSource;
};

export function useChatConversationList(params: {
  enabled?: boolean;
  repositoryLoading?: boolean;
  repositorySyncing?: boolean;
}): ChatConversationListData {
  const useStore = (params.enabled ?? true) && shouldUseChatDomainStore();

  const subscribeStore = useCallback((onChange: () => void) => {
    const store = ensureChatDomainStoreSession();
    if (!store) return () => undefined;
    return store.subscribe(() => {
      recordStoreSubscription();
      onChange();
    });
  }, []);

  const getStoreSnapshot = useCallback(() => {
    return ensureChatDomainStoreSession()?.getState() ?? createInitialChatDomainState();
  }, []);

  const storeState = useSyncExternalStore(
    useStore ? subscribeStore : () => () => undefined,
    getStoreSnapshot,
    getStoreSnapshot,
  );

  const rows = useMemo(() => {
    if (!useStore) return [];
    return selectChatConversationsForUi(storeState);
  }, [useStore, storeState]);

  if (!useStore) {
    auditLogHook(0, 'react-query');
    return {
      conversations: [],
      isLoading: Boolean(params.repositoryLoading),
      isSyncing: Boolean(params.repositorySyncing),
      source: 'react-query',
    };
  }

  auditLogHook(rows.length, 'store');
  return {
    conversations: rows,
    isLoading: selectLoadingConversations(storeState) || Boolean(params.repositoryLoading),
    isSyncing: Boolean(params.repositorySyncing),
    source: 'store',
  };
}
