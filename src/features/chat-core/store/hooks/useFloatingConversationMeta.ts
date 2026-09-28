/**
 * Sprint 2 / Phase 10E — Conversation meta (header) do Floating.
 * Store ON: Domain Store (mesma row da lista).
 * Store OFF: React Query + findChatConversationById (legado).
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation } from '@/services/chat';
import { findChatConversationById } from '@/repositories/chatConversationsRepository';
import {
  FLOATING_CHAT_META_STALE_MS,
} from '@/features/floating-chat/floatingChatQueries';
import { getCachedFloatingConversationById } from '@/features/floating-chat/queryCache';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import { selectCurrentConversation } from '../chatSelectors';
import { shouldReactQueryOwnConversationMeta } from '../../runtime/cachePrecedence';
import { recordStoreSubscription } from '../consolidatedMetrics';
import {
  recordSubscriptionAttach,
  recordSubscriptionNotify,
} from '../../metrics/subscriptionMetrics';

export type FloatingConversationMetaData = {
  conversation: ChatConversation | null | undefined;
  source: 'store' | 'react-query';
  isLoading: boolean;
};

export function useFloatingConversationMeta(params: {
  conversationId: string;
  instanceIds: string[];
  inboxScope: 'tenant' | 'owner';
}): FloatingConversationMetaData {
  const { conversationId, instanceIds, inboxScope } = params;
  const useStore = shouldUseChatDomainStore();
  const rqOwnsMeta = shouldReactQueryOwnConversationMeta();
  const queryClient = useQueryClient();

  const rq = useQuery({
    queryKey: ['floating-chat', 'conversation-meta', conversationId],
    enabled: rqOwnsMeta && Boolean(conversationId),
    queryFn: async (): Promise<ChatConversation | null> => {
      const cached = getCachedFloatingConversationById(queryClient, conversationId);
      if (cached) return cached;
      return findChatConversationById({
        surface: 'float',
        conversationId,
        instanceIds,
        inboxScope,
      });
    },
    staleTime: FLOATING_CHAT_META_STALE_MS,
    placeholderData: () => getCachedFloatingConversationById(queryClient, conversationId),
  });

  const subscribeStore = useCallback((onChange: () => void) => {
    const store = getChatDomainStoreSession();
    if (!store) return () => undefined;
    const detach = recordSubscriptionAttach('useFloatingConversationMeta');
    const unsub = store.subscribe(() => {
      recordStoreSubscription();
      recordSubscriptionNotify('useFloatingConversationMeta');
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

  const storeConversation = useMemo(() => {
    if (!useStore || !conversationId) return null;
    return selectCurrentConversation(storeState, conversationId);
  }, [useStore, conversationId, storeState]);

  if (useStore) {
    return {
      conversation: storeConversation,
      source: 'store',
      isLoading: false,
    };
  }

  return {
    conversation: rq.data,
    source: 'react-query',
    isLoading: rq.isLoading,
  };
}
