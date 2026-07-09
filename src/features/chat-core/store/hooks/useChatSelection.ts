/**
 * F5.4 — seleção de conversa do Chat Principal (read-only via Domain Store).
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ChatConversation } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { createInitialChatDomainState } from '../state';
import { chatDomainActionCreators } from '../actions';
import { selectCurrentConversation, selectSelectedConversationForUi } from '../chatSelectors';
import { recordStoreSubscription } from '../consolidatedMetrics';

export type ChatSelectionData = {
  selectedConversationId: string | null;
  selectedConversation: ChatConversation | null;
};

export function useChatSelection(
  selectedConversationId: string | null,
  params?: { enabled?: boolean },
): ChatSelectionData {
  const useStore = (params?.enabled ?? true) && shouldUseChatDomainStore();

  useEffect(() => {
    if (!useStore) return;
    const store = getChatDomainStoreSession();
    if (!store) return;
    store.dispatch(chatDomainActionCreators.setSelectedConversation(selectedConversationId));
  }, [useStore, selectedConversationId]);

  const subscribeStore = useCallback((onChange: () => void) => {
    const store = getChatDomainStoreSession();
    if (!store) return () => undefined;
    return store.subscribe(() => {
      recordStoreSubscription();
      onChange();
    });
  }, []);

  const getStoreSnapshot = useCallback(() => {
    return getChatDomainStoreSession()?.getState() ?? createInitialChatDomainState();
  }, []);

  const storeState = useSyncExternalStore(
    useStore ? subscribeStore : () => () => undefined,
    getStoreSnapshot,
    getStoreSnapshot,
  );

  if (!useStore) {
    return {
      selectedConversationId,
      selectedConversation: null,
    };
  }

  const selectedConversation =
    selectCurrentConversation(storeState, selectedConversationId) ??
    selectSelectedConversationForUi(storeState);

  return {
    selectedConversationId: selectedConversationId,
    selectedConversation,
  };
}
