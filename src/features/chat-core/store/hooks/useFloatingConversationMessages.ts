/**
 * F5.3 — hook de mensagens do Floating Chat (Store ou React Query).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@/services/chat';
import { chatService } from '@/services/chat';
import { FLOATING_CHAT_MESSAGES_STALE_MS } from '@/features/floating-chat/floatingChatQueries';
import { openConversationMessagesCommand } from '../../core/commands';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import {
  selectMessageVersion,
  selectMessagesForUi,
  selectMessageLoading,
} from '../messageSelectors';
import { recordFloatingMessageRender } from '../floatingMessageMetrics';
import { recordChatRenderMs, recordStoreSubscription } from '../consolidatedMetrics';
import { applyFloatingMessagesUpdater } from '../messageMutations';
import {
  recordSubscriptionAttach,
  recordSubscriptionNotify,
} from '../../metrics/subscriptionMetrics';
import { recordSocketUiFlush } from '../../metrics/socketMetrics';
import { shouldFloatDumpAllMessages } from '@/features/floating-chat/floatingMessageLoadPolicy';
import { shouldReactQueryOwnChatThread } from '../../runtime/cachePrecedence';

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
  // MB-031: RQ só é dono da thread quando Store OFF.
  const rqOwnsThread = shouldReactQueryOwnChatThread();

  const messagesQueryKey = useMemo(
    () => ['floating-chat', 'messages', conversationId] as const,
    [conversationId],
  );

  const rq = useQuery({
    queryKey: messagesQueryKey,
    enabled: rqOwnsThread && Boolean(conversationId),
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
    const detach = recordSubscriptionAttach('useFloatingConversationMessages');
    const unsub = store.subscribe(() => {
      recordStoreSubscription();
      recordSubscriptionNotify('useFloatingConversationMessages');
      recordSocketUiFlush();
      onChange();
    });
    return () => {
      detach();
      unsub();
    };
  }, []);

  const getStoreSnapshot = useCallback(() => {
    return getChatDomainStoreSession()?.getState() ?? EMPTY_CHAT_DOMAIN_STATE;
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
      await openConversationMessagesCommand(
        conversationId,
        shouldFloatDumpAllMessages() ? { latestPage: false } : undefined,
      );
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
