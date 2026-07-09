/**
 * F5.4 — mensagens do Chat Principal (read-only via Domain Store).
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { ChatMessage } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession } from '../session';
import { createInitialChatDomainState } from '../state';
import {
  selectChatMessagesForUi,
  selectConversationLoading,
} from '../chatSelectors';
import { selectMessageVersion } from '../messageSelectors';
import type { ChatRenderSource } from '../chatMetrics';
import { recordStoreSubscription } from '../consolidatedMetrics';

export type ChatMessagesData = {
  messages: ChatMessage[];
  isLoading: boolean;
  source: ChatRenderSource;
  messageVersion: number;
};

export function useChatMessages(
  conversationId: string | null,
  params?: { enabled?: boolean; repositoryLoading?: boolean },
): ChatMessagesData {
  const useStore = (params?.enabled ?? true) && shouldUseChatDomainStore();

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

  if (!useStore) {
    return {
      messages: [],
      isLoading: Boolean(params?.repositoryLoading),
      source: 'react-query',
      messageVersion: 0,
    };
  }

  const id = conversationId ?? '';
  return {
    messages: conversationId ? selectChatMessagesForUi(storeState, conversationId) : [],
    isLoading:
      (conversationId ? selectConversationLoading(storeState, conversationId) : false) ||
      Boolean(params?.repositoryLoading),
    source: 'store',
    messageVersion: conversationId ? selectMessageVersion(storeState, conversationId) : 0,
  };
}
