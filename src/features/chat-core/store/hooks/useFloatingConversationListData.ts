/**
 * F5.2 — hook da lista de conversas do Floating Chat (Store ou React Query).
 * TF6 — limit=50 + load more + page meta.
 * TF7 E4 — warm + freshness + mirror + force (parity com Chat).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FLOATING_CHAT_LIST_STALE_MS,
  floatingChatConversationsQueryKey,
} from '@/features/floating-chat/floatingChatQueries';
import {
  DEFAULT_INBOX_PAGE_SIZE,
  listChatConversations,
  type ChatInboxScope,
} from '@/repositories/chatConversationsRepository';
import {
  buildDefaultChatPageInboxFiltersKey,
  readChatPageCacheUpdatedAt,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { useAuth } from '@/contexts/AuthContext';
import {
  getInboxPageMeta,
  loadInboxCommand,
  loadMoreInboxCommand,
  forceReloadInboxCommand,
  mergeConversationLists,
  warmInboxFromPageCache,
  markInboxFreshFromClient,
  mirrorStoreInboxToPageCache,
  scheduleInboxSoftReconcileOnRealtimeConnected,
} from '../../core/commands';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../session';
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
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  /** TF7 E4 — force GET (ignora TTL); opcional limpar disk. */
  refreshInbox: (opts?: { clearLocalCache?: boolean }) => Promise<void>;
};

export function useFloatingConversationListData(params: {
  instanceIds: string[];
  inboxScope: ChatInboxScope;
  quick: ConversationQuickFilter;
  listOpen: boolean;
}): FloatingConversationListData {
  const useStore = shouldUseChatDomainStore();
  const { instanceIds, inboxScope, quick, listOpen } = params;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const cacheScope = useMemo<ChatPageCacheScope>(
    () => ({
      tenantId: user?.tenant_id ?? '__owner__',
      userId: user?.id ?? '',
    }),
    [user?.tenant_id, user?.id],
  );

  const pageFiltersKey = useMemo(
    () =>
      buildDefaultChatPageInboxFiltersKey({
        tenantId: user?.tenant_id ?? '',
        inboxScope,
        instanceIds,
      }),
    [user?.tenant_id, inboxScope, instanceIds],
  );

  const [rqHasMore, setRqHasMore] = useState(false);
  const [rqNextCursor, setRqNextCursor] = useState<string | null>(null);
  const [rqLoadingMore, setRqLoadingMore] = useState(false);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeLoadingMore, setStoreLoadingMore] = useState(false);

  const rq = useQuery({
    queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, quick),
    enabled: !useStore && listOpen && instanceIds.length > 0,
    queryFn: async () => {
      const page = await listChatConversations({
        surface: 'float',
        instanceIds,
        inboxScope,
        quickFilter: quick,
        limit: DEFAULT_INBOX_PAGE_SIZE,
      });
      setRqHasMore(page.hasMore);
      setRqNextCursor(page.nextCursor);
      return page.items;
    },
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

  const inboxParams = useMemo(
    () => ({
      instanceIds,
      inboxScope,
      quickFilter: quick,
      surface: 'float' as const,
    }),
    [instanceIds, inboxScope, quick],
  );

  const loadStoreInbox = useCallback(async () => {
    if (!useStore || !listOpen || instanceIds.length === 0) return;
    const generation = ++loadGenerationRef.current;
    ensureChatDomainStoreSession();

    // TF7 E4 — warm + seed freshness (mesmo contrato Chat E1/E2).
    if (cacheScope.userId) {
      const warm = warmInboxFromPageCache({
        scope: cacheScope,
        filtersKey: pageFiltersKey,
      });
      if (warm.warmed && warm.cachedUpdatedAt != null) {
        const seeded = markInboxFreshFromClient(inboxParams, warm.cachedUpdatedAt);
        if (seeded) {
          scheduleInboxSoftReconcileOnRealtimeConnected(inboxParams);
        }
      } else if (!warm.warmed) {
        const diskAt = readChatPageCacheUpdatedAt(cacheScope, pageFiltersKey);
        if (diskAt != null) {
          const seeded = markInboxFreshFromClient(inboxParams, diskAt);
          if (seeded) {
            scheduleInboxSoftReconcileOnRealtimeConnected(inboxParams);
          }
        }
      }
    }

    const cachedCount = getChatDomainStoreSession()?.getState().conversations.orderedIds.length ?? 0;
    setStoreLoading(cachedCount === 0);
    setStoreFetching(true);
    const start = performance.now();
    try {
      const result = await loadInboxCommand(inboxParams);
      if (generation !== loadGenerationRef.current) return;

      setStoreHasMore(result.hasMore || getInboxPageMeta(inboxParams).hasMore);

      if (result.source !== 'cache' && result.applied && cacheScope.userId) {
        mirrorStoreInboxToPageCache(cacheScope, pageFiltersKey, null);
      }

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
  }, [
    useStore,
    listOpen,
    instanceIds,
    inboxParams,
    quick,
    cacheScope,
    pageFiltersKey,
  ]);

  useEffect(() => {
    if (!useStore) return;
    void loadStoreInbox();
  }, [useStore, loadStoreInbox]);

  const storeConversations = useMemo(() => {
    if (!useStore) return [];
    return selectConversationsForUi(storeState, { quickFilter: quick });
  }, [useStore, storeState, quick]);

  const loadMoreStore = useCallback(async () => {
    if (!useStore || storeLoadingMore) return;
    const meta = getInboxPageMeta(inboxParams);
    if (!meta.hasMore && !storeHasMore) return;
    setStoreLoadingMore(true);
    try {
      const result = await loadMoreInboxCommand(inboxParams);
      setStoreHasMore(result.hasMore);
      if (result.applied && cacheScope.userId) {
        mirrorStoreInboxToPageCache(cacheScope, pageFiltersKey, null);
      }
    } finally {
      setStoreLoadingMore(false);
    }
  }, [
    useStore,
    storeLoadingMore,
    inboxParams,
    storeHasMore,
    cacheScope,
    pageFiltersKey,
  ]);

  const refreshInbox = useCallback(
    async (opts?: { clearLocalCache?: boolean }) => {
      if (!useStore || instanceIds.length === 0) {
        if (!useStore) {
          await queryClient.invalidateQueries({
            queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, quick),
          });
        }
        return;
      }
      const generation = ++loadGenerationRef.current;
      setStoreFetching(true);
      try {
        const result = await forceReloadInboxCommand(
          inboxParams,
          opts?.clearLocalCache && cacheScope.userId
            ? { clearPageCacheScope: cacheScope }
            : undefined,
        );
        if (generation !== loadGenerationRef.current) return;
        setStoreHasMore(result.hasMore);
        if (cacheScope.userId) {
          mirrorStoreInboxToPageCache(cacheScope, pageFiltersKey, null);
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setStoreFetching(false);
          setStoreLoading(false);
        }
      }
    },
    [
      useStore,
      instanceIds,
      inboxScope,
      quick,
      queryClient,
      inboxParams,
      cacheScope,
      pageFiltersKey,
    ],
  );

  const loadMoreRq = useCallback(async () => {
    if (useStore || rqLoadingMore || !rqNextCursor) return;
    setRqLoadingMore(true);
    try {
      const page = await listChatConversations({
        surface: 'float',
        instanceIds,
        inboxScope,
        quickFilter: quick,
        limit: DEFAULT_INBOX_PAGE_SIZE,
        cursor: rqNextCursor,
      });
      const key = floatingChatConversationsQueryKey(instanceIds, inboxScope, quick);
      const prev = queryClient.getQueryData(key) as typeof page.items | undefined;
      queryClient.setQueryData(key, mergeConversationLists(prev ?? [], page.items));
      setRqHasMore(page.hasMore);
      setRqNextCursor(page.nextCursor);
    } finally {
      setRqLoadingMore(false);
    }
  }, [
    useStore,
    rqLoadingMore,
    rqNextCursor,
    instanceIds,
    inboxScope,
    quick,
    queryClient,
  ]);

  if (!useStore) {
    return {
      conversations: rq.data ?? [],
      isLoading: rq.isLoading,
      isFetching: rq.isFetching,
      source: 'react-query',
      hasMore: rqHasMore,
      isLoadingMore: rqLoadingMore,
      loadMore: loadMoreRq,
      refreshInbox,
    };
  }

  return {
    conversations: storeConversations,
    isLoading: storeLoading && storeConversations.length === 0,
    isFetching: storeFetching,
    source: 'store',
    hasMore: storeHasMore,
    isLoadingMore: storeLoadingMore,
    loadMore: loadMoreStore,
    refreshInbox,
  };
}
