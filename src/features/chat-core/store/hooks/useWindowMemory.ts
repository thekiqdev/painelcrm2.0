/**
 * F6.2 — diagnóstico de memória da janela por conversa.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import {
  selectConversationMemoryUsage,
  selectEvictedPages,
} from '../windowSelectors';
import { getWindowMetricsSnapshot } from '../../metrics/windowMetrics';
import type { MessagePageId } from '../windowCacheTypes';

export type UseWindowMemoryResult = {
  enabled: boolean;
  memoryFootprint: number;
  residentPages: number;
  residentMessages: number;
  evictedPages: MessagePageId[];
  metrics: ReturnType<typeof getWindowMetricsSnapshot>;
};

export function useWindowMemory(
  conversationId: string | null | undefined,
): UseWindowMemoryResult {
  const useStore = shouldUseChatDomainStore() && Boolean(conversationId);

  const subscribe = useCallback((onChange: () => void) => {
    const store = ensureChatDomainStoreSession();
    if (!store) return () => undefined;
    return store.subscribe(() => onChange());
  }, []);

  const getSnapshot = useCallback(() => {
    return getChatDomainStoreSession()?.getState() ?? EMPTY_CHAT_DOMAIN_STATE;
  }, []);

  const state = useSyncExternalStore(
    useStore ? subscribe : () => () => undefined,
    getSnapshot,
    getSnapshot,
  );

  if (!useStore || !conversationId) {
    return {
      enabled: false,
      memoryFootprint: 0,
      residentPages: 0,
      residentMessages: 0,
      evictedPages: [],
      metrics: getWindowMetricsSnapshot(),
    };
  }

  const usage = selectConversationMemoryUsage(state, conversationId);
  return {
    enabled: true,
    memoryFootprint: usage.memoryFootprint,
    residentPages: usage.residentPages,
    residentMessages: usage.residentMessages,
    evictedPages: selectEvictedPages(state, conversationId),
    metrics: getWindowMetricsSnapshot(),
  };
}
