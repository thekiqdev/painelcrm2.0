/**
 * F5.4 / F6.5 — seleção de conversa (selector estável).
 */

import { useEffect } from 'react';
import type { ChatConversation } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import { getChatDomainStoreSession } from '../session';
import { chatDomainActionCreators } from '../actions';
import { selectCurrentConversation, selectSelectedConversationForUi } from '../chatSelectors';
import { useStableSelector } from './useStableSelector';
import { conversationUiFingerprint } from '../selectorMemo';

export type ChatSelectionData = {
  selectedConversationId: string | null;
  selectedConversation: ChatConversation | null;
};

function selectedConversationEqual(
  a: ChatConversation | null,
  b: ChatConversation | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return conversationUiFingerprint(a) === conversationUiFingerprint(b);
}

export function useChatSelection(
  selectedConversationId: string | null,
  params?: { enabled?: boolean },
): ChatSelectionData {
  const useStore = (params?.enabled ?? true) && shouldUseChatDomainStore();

  useEffect(() => {
    if (!useStore) return;
    const store = getChatDomainStoreSession();
    if (!store) return;
    if (store.getState().selection.selectedConversationId === selectedConversationId) {
      return;
    }
    store.dispatch(chatDomainActionCreators.setSelectedConversation(selectedConversationId));
  }, [useStore, selectedConversationId]);

  const selectedConversation = useStableSelector(
    (state) =>
      selectCurrentConversation(state, selectedConversationId) ??
      selectSelectedConversationForUi(state),
    {
      enabled: useStore,
      name: 'useChatSelection',
      equalityFn: selectedConversationEqual,
    },
  );

  if (!useStore) {
    return {
      selectedConversationId,
      selectedConversation: null,
    };
  }

  return {
    selectedConversationId,
    selectedConversation,
  };
}
