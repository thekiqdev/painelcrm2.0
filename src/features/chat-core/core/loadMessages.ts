/**
 * F5.10 / F6.1 — hidratação de mensagens.
 * Store ON: última página + metadados de cursor (Load More).
 * Store OFF: dump integral via messagesFetch (legado).
 */

import type { ChatConversationId, ChatDomainMessage } from '../domain/types';
import { applyStoreMessagesInternal } from '../store/consolidation';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';
import { fetchConversationMessages } from './messagesFetch';
import {
  DEFAULT_MESSAGES_PAGE_SIZE,
  getMessagesPage,
} from './messagesPageFetch';
import { chatDomainActionCreators } from '../store/actions';

export type LoadMessagesResult = {
  domain: ChatDomainMessage[];
  applied: boolean;
  stale: boolean;
  hasMore?: boolean;
  nextCursor?: string | null;
};

const generationByConversation = new Map<string, number>();

/** @internal testes */
export function resetLoadMessagesStateForTests(): void {
  generationByConversation.clear();
}

/** @internal testes */
export function getLoadMessagesGenerationForTests(conversationId: string): number {
  return generationByConversation.get(conversationId) ?? 0;
}

function writeMessagesToStore(
  conversationId: ChatConversationId,
  messages: readonly ChatDomainMessage[],
  generation: number,
): boolean {
  if (generationByConversation.get(conversationId) !== generation) return false;
  if (!shouldUseChatDomainStore()) return false;
  ensureChatDomainStoreSession();
  applyStoreMessagesInternal(conversationId, messages);
  return true;
}

/**
 * Hidratação oficial de mensagens ao abrir conversa.
 * Com CHAT_CORE_STORE ON (F6.1): por padrão carrega a última página e prepara cursor.
 * Passar `latestPage` omitido/true para última página; `false` só via Floating dump rollback env.
 */
export async function loadMessagesCommand(
  conversationId: ChatConversationId,
  options?: { latestPage?: boolean },
): Promise<ChatDomainMessage[]> {
  const generation = (generationByConversation.get(conversationId) ?? 0) + 1;
  generationByConversation.set(conversationId, generation);

  const useLatestPage = options?.latestPage !== false;

  if (shouldUseChatDomainStore() && useLatestPage) {
    const page = await getMessagesPage({
      conversationId,
      pageSize: DEFAULT_MESSAGES_PAGE_SIZE,
      latestPage: true,
    });

    if (generationByConversation.get(conversationId) !== generation) {
      return page.messages;
    }

    const applied = writeMessagesToStore(conversationId, page.messages, generation);
    if (applied) {
      const store = getChatDomainStoreSession();
      store?.dispatch(
        chatDomainActionCreators.setMessageCursor(conversationId, {
          nextCursor: page.nextCursor,
          previousCursor: page.previousCursor,
          hasMore: page.hasMore,
        }),
      );
    }
    return page.messages;
  }

  const domain = await fetchConversationMessages(conversationId);

  if (generationByConversation.get(conversationId) !== generation) {
    return domain;
  }

  if (shouldUseChatDomainStore()) {
    writeMessagesToStore(conversationId, domain, generation);
  }

  return domain;
}
