/**
 * F5.3 — mutações de mensagens no Store a partir da UI legado (optimistic / outbound).
 */

import type { ChatMessage } from '@/services/chat';
import type { ChatConversationId } from '../domain/types';
import { getChatDomainStoreSession } from './session';
import { shouldUseChatDomainStore } from './flags';
import { chatDomainActionCreators } from './actions';
import { mapLegacyMessageToDomain } from './domainMappers';
import { selectMessagesForUi } from './messageSelectors';

export function applyFloatingMessagesUpdater(
  conversationId: ChatConversationId,
  updater: (prev: ChatMessage[]) => ChatMessage[],
): boolean {
  if (!shouldUseChatDomainStore()) return false;
  const store = getChatDomainStoreSession();
  if (!store) return false;

  const prev = selectMessagesForUi(store.getState(), conversationId);
  const next = updater(prev);
  const domainMessages = next.map(mapLegacyMessageToDomain);
  store.dispatch(chatDomainActionCreators.setMessages(conversationId, domainMessages));
  return true;
}
