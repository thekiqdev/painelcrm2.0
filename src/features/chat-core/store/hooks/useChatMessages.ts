/**
 * F5.4 / F6.5 — mensagens do Chat Principal (selector estável).
 */

import type { ChatMessage } from '@/services/chat';
import { shouldUseChatDomainStore } from '../flags';
import {
  selectChatMessagesForUi,
  selectConversationLoading,
} from '../chatSelectors';
import { selectMessageVersion } from '../messageSelectors';
import type { ChatRenderSource } from '../chatMetrics';
import { useStableSelector } from './useStableSelector';
import { messagesUiEqual } from '../selectorMemo';

export type ChatMessagesData = {
  messages: ChatMessage[];
  isLoading: boolean;
  source: ChatRenderSource;
  messageVersion: number;
};

type MessagesSlice = {
  messages: ChatMessage[];
  isLoading: boolean;
  messageVersion: number;
};

function messagesSliceEqual(a: MessagesSlice, b: MessagesSlice): boolean {
  return (
    a.messageVersion === b.messageVersion &&
    a.isLoading === b.isLoading &&
    messagesUiEqual(a.messages, b.messages)
  );
}

export function useChatMessages(
  conversationId: string | null,
  params?: { enabled?: boolean; repositoryLoading?: boolean },
): ChatMessagesData {
  const useStore = (params?.enabled ?? true) && shouldUseChatDomainStore();

  const slice = useStableSelector(
    (state): MessagesSlice => {
      if (!conversationId) {
        return { messages: [], isLoading: false, messageVersion: 0 };
      }
      return {
        messages: selectChatMessagesForUi(state, conversationId),
        isLoading: selectConversationLoading(state, conversationId),
        messageVersion: selectMessageVersion(state, conversationId),
      };
    },
    {
      enabled: useStore,
      name: 'useChatMessages',
      equalityFn: messagesSliceEqual,
    },
  );

  if (!useStore) {
    return {
      messages: [],
      isLoading: Boolean(params?.repositoryLoading),
      source: 'react-query',
      messageVersion: 0,
    };
  }

  return {
    messages: slice.messages,
    isLoading: slice.isLoading || Boolean(params?.repositoryLoading),
    source: 'store',
    messageVersion: slice.messageVersion,
  };
}
