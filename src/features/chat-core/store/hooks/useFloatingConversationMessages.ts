/**
 * F5.3 — hook de mensagens do Floating Chat (Store ou React Query).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@/services/chat';
import { chatService } from '@/services/chat';
import { FLOATING_CHAT_MESSAGES_STALE_MS } from '@/features/floating-chat/floatingChatQueries';
import { loadMessagesCommand } from '../../core/commands';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { createInitialChatDomainState } from '../state';
import {
  selectMessageVersion,
  selectMessagesForUi,
  selectMessageLoading,
} from '../messageSelectors';
import { recordFloatingMessageRender } from '../floatingMessageMetrics';
import { recordChatRenderMs, recordStoreSubscription } from '../consolidatedMetrics';
import { applyFloatingMessagesUpdater } from '../messageMutations';

export type FloatingConversationMessagesData = {
  messages: ChatMessage[];
  isLoading: boolean;
  isFetching: boolean;
  source: 'store' | 'react-query';
  applyMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
};

export function useFloatingConversationMessages(
  conversationId: string,
): FloatingConversationMessagesData {
  const useStore = shouldUseChatDomainStore();
  const queryClient = useQueryClient();

  const messagesQueryKey = useMemo(
    () => ['floating-chat', 'messages', conversationId] as const,
    [conversationId],
  );

  const rq = useQuery({
    queryKey: messagesQueryKey,
    enabled: !useStore && Boolean(conversationId),
    queryFn: async () => {
      const rows = await chatService.getConversationMessages(conversationId);
      void chatService.syncConversationMessages(conversationId, {}).catch(() => {});
      return rows;
    },
    staleTime: FLOATING_CHAT_MESSAGES_STALE_MS,
    placeholderData: (prev) => prev,
  });

  const [storeFetching, setStoreFetching] = useState(false);
  const loadGenerationRef = useRef(0);

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

  const storeState = useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);
  const messageVersion = useStore
    ? selectMessageVersion(storeState, conversationId)
    : 0;

  const loadStoreMessages = useCallback(async () => {
    if (!useStore || !conversationId) return;
    const generation = ++loadGenerationRef.current;
    setStoreFetching(true);
    const start = performance.now();
    try {
      await loadMessagesCommand(conversationId);
      if (generation !== loadGenerationRef.current) return;

      const store = getChatDomainStoreSession();
      const storeItems = store ? selectMessagesForUi(store.getState(), conversationId) : [];
      const durationMs = Math.round(performance.now() - start);

      recordChatRenderMs(durationMs);
      recordFloatingMessageRender({
        source: 'store',
        durationMs,
        messageCount: storeItems.length,
      });
    } finally {
      if (generation === loadGenerationRef.current) {
        setStoreFetching(false);
      }
    }
  }, [useStore, conversationId]);

  useEffect(() => {
    if (!useStore) return;
    void loadStoreMessages();
  }, [useStore, loadStoreMessages]);

  const storeMessages = useMemo(() => {
    if (!useStore) return [];
    return selectMessagesForUi(storeState, conversationId);
    // messageVersion forces recompute on store message mutations
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is intentional
  }, [useStore, storeState, conversationId, messageVersion]);

  const applyMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      if (useStore) {
        applyFloatingMessagesUpdater(conversationId, updater);
        return;
      }
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (old) => updater(old ?? []));
    },
    [useStore, conversationId, queryClient, messagesQueryKey],
  );

  if (!useStore) {
    return {
      messages: rq.data ?? [],
      isLoading: rq.isLoading,
      isFetching: rq.isFetching,
      source: 'react-query',
      applyMessages,
    };
  }

  const storeLoading = selectMessageLoading(storeState, conversationId);

  return {
    messages: storeMessages,
    isLoading: (storeLoading || storeFetching) && storeMessages.length === 0,
    isFetching: storeFetching,
    source: 'store',
    applyMessages,
  };
}
