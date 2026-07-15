/**
 * F6.0 — loadMessagesCursorCommand / resetConversationCursorCommand.
 */

import type { ChatConversationId, ChatDomainMessage } from '../domain/types';
import { chatDomainActionCreators } from '../store/actions';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';
import {
  DEFAULT_MESSAGES_PAGE_SIZE,
  getMessagesPage,
  type MessagesPageResult,
} from './messagesPageFetch';
import {
  decodeLegacyMessageCursor,
  encodeLegacyMessageCursor,
  mergePrependMessages,
} from '../store/messageMerge';
import {
  logCursorEvent,
  recordCursorDuplicates,
  recordCursorLatency,
  recordCursorLoadTime,
  recordCursorPrepended,
  recordCursorRequest,
} from '../metrics/cursorMetrics';
import { nowMs } from '../metrics/performanceMetrics';

export type LoadMessagesCursorParams = {
  conversationId: ChatConversationId;
  /** Se omitido, usa nextCursor do store (ou null = primeira página cursor). */
  cursor?: string | null;
  pageSize?: number;
};

export type LoadMessagesCursorResult = {
  messages: ChatDomainMessage[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  source: MessagesPageResult['source'];
  prepended: number;
  duplicatesDiscarded: number;
  applied: boolean;
  stale: boolean;
};

const inFlight = new Map<string, Promise<LoadMessagesCursorResult>>();
const generationByConversation = new Map<string, number>();

/** @internal testes */
export function resetLoadMessagesCursorStateForTests(): void {
  inFlight.clear();
  generationByConversation.clear();
}

function emptyResult(
  partial?: Partial<LoadMessagesCursorResult>,
): LoadMessagesCursorResult {
  return {
    messages: [],
    nextCursor: null,
    previousCursor: null,
    hasMore: false,
    source: 'legacy',
    prepended: 0,
    duplicatesDiscarded: 0,
    applied: false,
    stale: false,
    ...partial,
  };
}

/**
 * Carrega uma página incremental e aplica prepend no Domain Store (quando ON).
 * Não substitui `loadMessagesCommand` (hidratação integral F5).
 */
export async function loadMessagesCursorCommand(
  params: LoadMessagesCursorParams,
): Promise<LoadMessagesCursorResult> {
  const { conversationId } = params;
  const pageSize = params.pageSize ?? DEFAULT_MESSAGES_PAGE_SIZE;
  const key = `${conversationId}:${params.cursor ?? 'auto'}:${pageSize}`;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const run = (async (): Promise<LoadMessagesCursorResult> => {
    const generation = (generationByConversation.get(conversationId) ?? 0) + 1;
    generationByConversation.set(conversationId, generation);

    const storeOn = shouldUseChatDomainStore();
    const store = storeOn ? ensureChatDomainStoreSession() : null;

    let cursor = params.cursor;
    if (cursor === undefined && store) {
      cursor = store.getState().messages.nextCursorByConversationId[conversationId] ?? null;
    }

    if (store) {
      store.dispatch(chatDomainActionCreators.setLoadingMore(conversationId, true));
    }

    logCursorEvent('load', { conversationId, cursor, pageSize });
    recordCursorRequest();
    const t0 = nowMs();

    try {
      const page = await getMessagesPage({
        conversationId,
        cursor: cursor ?? null,
        pageSize,
      });

      const latency = Math.round(nowMs() - t0);
      recordCursorLatency(latency);
      recordCursorLoadTime(latency);
      logCursorEvent('hasMore', { conversationId, hasMore: page.hasMore });
      logCursorEvent('nextCursor', { conversationId, nextCursor: page.nextCursor });

      if (generationByConversation.get(conversationId) !== generation) {
        return emptyResult({
          messages: page.messages,
          nextCursor: page.nextCursor,
          previousCursor: page.previousCursor,
          hasMore: page.hasMore,
          source: page.source,
          stale: true,
        });
      }

      if (!storeOn || !store) {
        return emptyResult({
          messages: page.messages,
          nextCursor: page.nextCursor,
          previousCursor: page.previousCursor,
          hasMore: page.hasMore,
          source: page.source,
          applied: false,
        });
      }

      const state = store.getState();
      const existingIds = state.messages.byConversationId[conversationId] ?? [];

      // Primeira página cursor sem mensagens no store → set (não prepend).
      if (existingIds.length === 0 && !cursor) {
        store.dispatch(chatDomainActionCreators.setMessages(conversationId, page.messages));
        let nextCursor = page.nextCursor;
        let hasMore = page.hasMore;
        if (page.source === 'legacy' && page.messages.length > 0) {
          // Dump legado: sem paginação adicional por padrão.
          nextCursor = null;
          hasMore = false;
        } else if (page.source === 'legacy' && pageSize > 0 && page.messages.length > pageSize) {
          // Se no futuro o fallback fatiar, expor cursor do mais antigo.
          const oldest = page.messages[0];
          nextCursor = oldest ? encodeLegacyMessageCursor(oldest.id) : null;
          hasMore = Boolean(nextCursor);
        }
        store.dispatch(
          chatDomainActionCreators.setMessageCursor(conversationId, {
            nextCursor,
            previousCursor: page.previousCursor,
            hasMore,
          }),
        );
        logCursorEvent('merge', { conversationId, mode: 'set', count: page.messages.length });
        return {
          messages: page.messages,
          nextCursor,
          previousCursor: page.previousCursor,
          hasMore,
          source: page.source,
          prepended: page.messages.length,
          duplicatesDiscarded: 0,
          applied: true,
          stale: false,
        };
      }

      const merge = mergePrependMessages(existingIds, state.messages.byId, page.messages);
      logCursorEvent('prepend', {
        conversationId,
        prepended: merge.prepended,
        duplicates: merge.duplicatesDiscarded,
      });
      if (merge.duplicatesDiscarded > 0) {
        logCursorEvent('duplicate', {
          conversationId,
          discarded: merge.duplicatesDiscarded,
        });
      }
      recordCursorPrepended(merge.prepended);
      recordCursorDuplicates(merge.duplicatesDiscarded);

      let nextCursor = page.nextCursor;
      let hasMore = page.hasMore;
      if (page.source === 'legacy' && merge.prepended > 0) {
        const oldestId = merge.orderedIds[0];
        const decoded = decodeLegacyMessageCursor(nextCursor);
        if (!nextCursor && oldestId) {
          // Sem next do servidor: se ainda houver mais antigas no payload futuro, hasMore=false.
          nextCursor = null;
          hasMore = false;
        } else if (decoded) {
          nextCursor = page.nextCursor;
          hasMore = page.hasMore;
        }
      }

      store.dispatch(
        chatDomainActionCreators.prependPage(conversationId, page.messages, {
          nextCursor,
          previousCursor: page.previousCursor ?? cursor ?? null,
          hasMore,
        }),
      );

      return {
        messages: page.messages,
        nextCursor,
        previousCursor: page.previousCursor ?? cursor ?? null,
        hasMore,
        source: page.source,
        prepended: merge.prepended,
        duplicatesDiscarded: merge.duplicatesDiscarded,
        applied: true,
        stale: false,
      };
    } finally {
      if (store && generationByConversation.get(conversationId) === generation) {
        store.dispatch(chatDomainActionCreators.setLoadingMore(conversationId, false));
      }
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}

/** Limpa metadados de cursor da conversa no Domain Store. */
export function resetConversationCursorCommand(conversationId: ChatConversationId): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession() ?? ensureChatDomainStoreSession();
  if (!store) return;
  store.dispatch(chatDomainActionCreators.resetCursor(conversationId));
  logCursorEvent('reset', { conversationId });
}
