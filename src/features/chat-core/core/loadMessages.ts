/**
 * F5.10 / F6.1 / Phase 10G — hidratação de mensagens + open pipeline coalescido.
 * Store ON: última página + metadados de cursor (Load More).
 * Store OFF: dump integral via messagesFetch (legado).
 */

import { chatService } from '@/services/chat';
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
import { recordHydrateGenerationMismatch } from '../metrics/previewMessagesMetrics';
import {
  recordOpenPipelineApplied,
  recordOpenPipelineCoalesced,
  recordOpenPipelineGenerationSupersede,
  recordOpenPipelineStart,
} from '../metrics/openConversationPipelineMetrics';

export type LoadMessagesResult = {
  domain: ChatDomainMessage[];
  applied: boolean;
  stale: boolean;
  hasMore?: boolean;
  nextCursor?: string | null;
};

export type LoadMessagesCommandOptions = {
  latestPage?: boolean;
  /** Não junta in-flight; inicia nova geração. */
  force?: boolean;
};

const generationByConversation = new Map<string, number>();

type InFlightEntry = {
  generation: number;
  latestPage: boolean;
  promise: Promise<ChatDomainMessage[]>;
};

const inFlightByConversation = new Map<string, InFlightEntry>();

/** @internal testes */
export function resetLoadMessagesStateForTests(): void {
  generationByConversation.clear();
  inFlightByConversation.clear();
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

async function runLoadMessages(
  conversationId: ChatConversationId,
  generation: number,
  useLatestPage: boolean,
): Promise<ChatDomainMessage[]> {
  if (shouldUseChatDomainStore() && useLatestPage) {
    const page = await getMessagesPage({
      conversationId,
      pageSize: DEFAULT_MESSAGES_PAGE_SIZE,
      latestPage: true,
    });

    if (generationByConversation.get(conversationId) !== generation) {
      recordHydrateGenerationMismatch();
      return page.messages;
    }

    const applied = writeMessagesToStore(conversationId, page.messages, generation);
    if (applied) {
      recordOpenPipelineApplied();
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
    recordHydrateGenerationMismatch();
    return domain;
  }

  if (shouldUseChatDomainStore()) {
    const applied = writeMessagesToStore(conversationId, domain, generation);
    if (applied) recordOpenPipelineApplied();
  }

  return domain;
}

/**
 * Hidratação oficial de mensagens ao abrir conversa.
 * Sprint 3: coalescing in-flight por conversationId + modo latest|all.
 */
export async function loadMessagesCommand(
  conversationId: ChatConversationId,
  options?: LoadMessagesCommandOptions,
): Promise<ChatDomainMessage[]> {
  const useLatestPage = options?.latestPage !== false;
  const force = options?.force === true;

  const existing = inFlightByConversation.get(conversationId);
  if (!force && existing && existing.latestPage === useLatestPage) {
    recordOpenPipelineCoalesced();
    return existing.promise;
  }

  if (existing) {
    recordOpenPipelineGenerationSupersede();
  }

  recordOpenPipelineStart();
  const generation = (generationByConversation.get(conversationId) ?? 0) + 1;
  generationByConversation.set(conversationId, generation);

  const promise = runLoadMessages(conversationId, generation, useLatestPage).finally(() => {
    const cur = inFlightByConversation.get(conversationId);
    if (cur?.generation === generation) {
      inFlightByConversation.delete(conversationId);
    }
  });

  inFlightByConversation.set(conversationId, {
    generation,
    latestPage: useLatestPage,
    promise,
  });

  return promise;
}

/**
 * TF4 — open de conversa: sync WA (best-effort) e só então hydrate latest com `force`.
 * Evita race em que o GET corre em paralelo ao sync e a thread fica atrás do preview da lista.
 */
export async function openConversationMessagesCommand(
  conversationId: ChatConversationId,
  options?: Omit<LoadMessagesCommandOptions, 'force'>,
): Promise<ChatDomainMessage[]> {
  try {
    await chatService.syncConversationMessages(conversationId, {});
  } catch {
    /* best-effort — ainda hidrata o que a API já tem */
  }
  return loadMessagesCommand(conversationId, {
    ...options,
    force: true,
    latestPage: options?.latestPage !== false,
  });
}
