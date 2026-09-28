/**
 * F6.2 — expõe estado da janela ativa por conversa.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import {
  selectConversationWindow,
  selectPinnedPages,
  selectResidentPages,
  selectWindowBounds,
} from '../windowSelectors';
import type { ConversationWindowState, MessagePageId } from '../windowCacheTypes';

export type UseConversationWindowResult = {
  enabled: boolean;
  residentPages: MessagePageId[];
  pinnedPages: MessagePageId[];
  windowStart: number;
  windowEnd: number;
  window: ConversationWindowState | null;
};

export function useConversationWindow(
  conversationId: string | null | undefined,
): UseConversationWindowResult {
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
      residentPages: [],
      pinnedPages: [],
      windowStart: 0,
      windowEnd: -1,
      window: null,
    };
  }

  const bounds = selectWindowBounds(state, conversationId);
  return {
    enabled: true,
    residentPages: selectResidentPages(state, conversationId),
    pinnedPages: selectPinnedPages(state, conversationId),
    windowStart: bounds.windowStart,
    windowEnd: bounds.windowEnd,
    window: selectConversationWindow(state, conversationId),
  };
}
