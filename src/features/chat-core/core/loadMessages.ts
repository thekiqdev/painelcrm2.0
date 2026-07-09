/**
 * F5.10 — único pipeline Repository → Command → Domain Store (mensagens).
 */

import type { ChatConversationId, ChatDomainMessage } from '../domain/types';
import { applyStoreMessagesInternal } from '../store/consolidation';
import { ensureChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';
import { fetchConversationMessages } from './messagesFetch';

export type LoadMessagesResult = {
  domain: ChatDomainMessage[];
  applied: boolean;
  stale: boolean;
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
 * Único command oficial de hidratação de mensagens.
 * Repository → Store (quando CHAT_CORE_STORE ON).
 */
export async function loadMessagesCommand(
  conversationId: ChatConversationId,
): Promise<ChatDomainMessage[]> {
  const generation = (generationByConversation.get(conversationId) ?? 0) + 1;
  generationByConversation.set(conversationId, generation);

  const domain = await fetchConversationMessages(conversationId);

  if (generationByConversation.get(conversationId) !== generation) {
    return domain;
  }

  if (shouldUseChatDomainStore()) {
    writeMessagesToStore(conversationId, domain, generation);
  }

  return domain;
}
