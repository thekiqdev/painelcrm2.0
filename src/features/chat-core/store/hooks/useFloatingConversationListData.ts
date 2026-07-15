/**
 * F5.2 — hook da lista de conversas do Floating Chat (Store ou React Query).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FLOATING_CHAT_LIST_STALE_MS,
  floatingChatConversationsQueryKey,
} from '@/features/floating-chat/floatingChatQueries';
import { listChatConversationsItems, type ChatInboxScope } from '@/repositories/chatConversationsRepository';
import { loadInboxCommand } from '../../core/commands';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import {
  selectConversationsForUi,
  type ConversationQuickFilter,
} from '../conversationSelectors';
import { recordFloatingConversationRender } from '../floatingMetrics';
import { recordChatRenderMs, recordStoreSubscription } from '../consolidatedMetrics';
import {
  recordSubscriptionAttach,
  recordSubscriptionNotify,
} from '../../metrics/subscriptionMetrics';
import { recordSocketUiFlush } from '../../metrics/socketMetrics';

export type FloatingConversationListData = {
  conversations: ReturnType<typeof selectConversationsForUi>;
  isLoading: boolean;
  isFetching: boolean;
  source: 'store' | 'react-query';
};

export function useFloatingConversationListData(params: {
  instanceIds: string[];
  inboxScope: ChatInboxScope;
  quick: ConversationQuickFilter;
  listOpen: boolean;
}): FloatingConversationListData {
  const useStore = shouldUseChatDomainStore();
  const { instanceIds, inboxScope, quick, listOpen } = params;

  const rq = useQuery({
    queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, quick),
    enabled: !useStore && listOpen && instanceIds.length > 0,
    queryFn: () =>
      listChatConversationsItems({
        surface: 'float',
        instanceIds,
        inboxScope,
        quickFilter: quick,
      }),
    staleTime: FLOATING_CHAT_LIST_STALE_MS,
    placeholderData: (prev) => prev,
  });

  const [storeLoading, setStoreLoading] = useState(false);
  const [storeFetching, setStoreFetching] = useState(false);
  const loadGenerationRef = useRef(0);

  const subscribeStore = useCallback((onChange: () => void) => {
    const store = getChatDomainStoreSession();
    if (!store) return () => undefined;
    const detach = recordSubscriptionAttach('useFloatingConversationListData');
    const unsub = store.subscribe(() => {
      recordStoreSubscription();
      recordSubscriptionNotify('useFloatingConversationListData');
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

  const loadStoreInbox = useCallback(async () => {
    if (!useStore || !listOpen || instanceIds.length === 0) return;
    const generation = ++loadGenerationRef.current;
    const cachedCount = getChatDomainStoreSession()?.getState().conversations.orderedIds.length ?? 0;
    setStoreLoading(cachedCount === 0);
    setStoreFetching(true);
    const start = performance.now();
    try {
      const result = await loadInboxCommand({
        instanceIds,
        inboxScope,
        quickFilter: quick,
        surface: 'float',
      });
      if (generation !== loadGenerationRef.current) return;

      const durationMs = Math.round(performance.now() - start);
      const store = getChatDomainStoreSession();
      const storeItems = store
        ? selectConversationsForUi(store.getState(), { quickFilter: quick })
        : [];

      recordChatRenderMs(durationMs);
      recordFloatingConversationRender({
        source: 'store',
        durationMs,
        storeCount: storeItems.length,
        repositoryCount: result.domain.length,
      });
    } finally {
      if (generation === loadGenerationRef.current) {
        setStoreLoading(false);
        setStoreFetching(false);
      }
    }
  }, [useStore, listOpen, instanceIds, inboxScope, quick]);

  useEffect(() => {
    if (!useStore) return;
    void loadStoreInbox();
  }, [useStore, loadStoreInbox]);

  const storeConversations = useMemo(() => {
    if (!useStore) return [];
    return selectConversationsForUi(storeState, { quickFilter: quick });
  }, [useStore, storeState, quick]);

  if (!useStore) {
    return {
      conversations: rq.data ?? [],
      isLoading: rq.isLoading,
      isFetching: rq.isFetching,
      source: 'react-query',
    };
  }

  return {
    conversations: storeConversations,
    isLoading: storeLoading && storeConversations.length === 0,
    isFetching: storeFetching,
    source: 'store',
  };
}
