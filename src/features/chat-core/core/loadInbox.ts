/**
 * F5.9 — único pipeline Repository → Command → Domain Store (inbox).
 * TF6 — limit=50, cursor/load-more, TTL coalesce.
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatDomainConversation, ChatInboxScope, ChatInstanceId } from '../domain/types';
import { mapLegacyConversationToDomain } from '../store/domainMappers';
import {
  applyStoreConversationListInternal,
  readStoreConversationCount,
} from '../store/consolidation';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';
import { selectConversationsForUi } from '../store/conversationSelectors';
import {
  DEFAULT_INBOX_PAGE_SIZE,
  type ChatConversationsListResult,
} from '@/repositories/chatConversationsRepository';
import { fetchInboxConversationsPage, type LoadInboxFetchParams, type LoadInboxSurface } from './inboxFetch';

export type LoadInboxParams = LoadInboxFetchParams & {
  /** Quando true, permite gravar lista vazia no Store. */
  allowEmpty?: boolean;
  /** replace = 1ª página; append = “Carregar mais”. */
  mode?: 'replace' | 'append';
  /** Ignora TTL / in-flight stale short-circuit. */
  force?: boolean;
};

export type LoadInboxResult = {
  items: ChatConversation[];
  domain: ChatDomainConversation[];
  /** Store recebeu a lista (false se stale ou skip empty). */
  applied: boolean;
  /** Resposta descartada por generation mais recente. */
  stale: boolean;
  nextCursor: string | null;
  hasMore: boolean;
  source: ChatConversationsListResult['source'] | 'cache';
};

/** TTL leve — evita storm Chat+Float no mesmo filtro. */
export const INBOX_LOAD_TTL_MS = 20_000;

let loadInboxGeneration = 0;
const inFlight = new Map<string, Promise<LoadInboxResult>>();

type InboxSuccessCache = {
  at: number;
  result: LoadInboxResult;
  nextCursor: string | null;
  hasMore: boolean;
};

const lastSuccessByFilterKey = new Map<string, InboxSuccessCache>();
const pageMetaByFilterKey = new Map<string, { nextCursor: string | null; hasMore: boolean }>();

function buildFilterKey(params: LoadInboxParams): string {
  const {
    instanceIds,
    inboxScope,
    surface = 'chat',
    quickFilter = 'all',
    attendanceFilter = '',
    channelOrigin = 'all',
    conversationFilter,
    allowEmpty = false,
  } = params;
  return JSON.stringify({
    ids: [...instanceIds].sort(),
    inboxScope,
    surface,
    quickFilter,
    attendanceFilter: attendanceFilter ?? '',
    channelOrigin,
    conversationFilter: conversationFilter ?? '',
    allowEmpty,
  });
}

function buildLoadKey(params: LoadInboxParams): string {
  return JSON.stringify({
    filter: buildFilterKey(params),
    cursor: params.cursor ?? null,
    mode: params.mode ?? 'replace',
    limit: params.limit ?? DEFAULT_INBOX_PAGE_SIZE,
  });
}

function shouldWriteToStore(items: ChatConversation[], allowEmpty: boolean): boolean {
  if (items.length > 0) return true;
  if (allowEmpty) return true;
  return readStoreConversationCount() === 0;
}

function writeInboxToStore(
  items: ChatConversation[],
  generation: number,
  mode: 'replace' | 'append',
): boolean {
  if (generation !== loadInboxGeneration) return false;
  if (!shouldUseChatDomainStore()) return false;
  ensureChatDomainStoreSession();

  if (mode === 'append') {
    const store = getChatDomainStoreSession();
    if (!store) return false;
    const prev = selectConversationsForUi(store.getState());
    const byId = new Map<string, ChatConversation>();
    for (const row of prev) byId.set(row.id, row);
    for (const row of items) {
      const existing = byId.get(row.id);
      byId.set(row.id, existing ? { ...existing, ...row, id: row.id } : row);
    }
    applyStoreConversationListInternal([...byId.values()]);
    return true;
  }

  applyStoreConversationListInternal(items);
  return true;
}

function mergeConversationLists(
  prev: ChatConversation[],
  next: ChatConversation[],
): ChatConversation[] {
  const byId = new Map<string, ChatConversation>();
  for (const row of prev) byId.set(row.id, row);
  for (const row of next) {
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...row, id: row.id } : row);
  }
  return [...byId.values()];
}

/** Invalida loads em voo e opcionalmente limpa o Store. */
export function clearInboxCommand(options?: { allowEmpty?: boolean }): void {
  loadInboxGeneration += 1;
  inFlight.clear();
  lastSuccessByFilterKey.clear();
  pageMetaByFilterKey.clear();
  if (!shouldUseChatDomainStore()) return;
  if (options?.allowEmpty !== false) {
    ensureChatDomainStoreSession();
    applyStoreConversationListInternal([]);
  }
}

/** Meta de paginação do último load bem-sucedido para o filtro. */
export function getInboxPageMeta(params: LoadInboxParams): {
  nextCursor: string | null;
  hasMore: boolean;
} {
  return (
    pageMetaByFilterKey.get(buildFilterKey(params)) ?? {
      nextCursor: null,
      hasMore: false,
    }
  );
}

/** @internal testes — generation atual do loader. */
export function getLoadInboxGenerationForTests(): number {
  return loadInboxGeneration;
}

/** @internal testes — reseta estado do loader. */
export function resetLoadInboxStateForTests(): void {
  loadInboxGeneration = 0;
  inFlight.clear();
  lastSuccessByFilterKey.clear();
  pageMetaByFilterKey.clear();
}

/**
 * Único command oficial de hidratação de inbox.
 * Repository → normalização → Store (quando CHAT_CORE_STORE ON).
 */
export async function loadInboxCommand(params: LoadInboxParams): Promise<LoadInboxResult> {
  const mode = params.mode ?? 'replace';
  const filterKey = buildFilterKey(params);
  const force = params.force === true;

  if (mode === 'replace' && !force && shouldUseChatDomainStore()) {
    const cached = lastSuccessByFilterKey.get(filterKey);
    if (
      cached &&
      Date.now() - cached.at < INBOX_LOAD_TTL_MS &&
      readStoreConversationCount() > 0
    ) {
      return {
        ...cached.result,
        applied: false,
        stale: false,
        source: 'cache',
      };
    }
  }

  const loadKey = buildLoadKey(params);
  const existing = inFlight.get(loadKey);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<LoadInboxResult> => {
    const generation = ++loadInboxGeneration;
    try {
      const page = await fetchInboxConversationsPage({
        ...params,
        limit: params.limit ?? DEFAULT_INBOX_PAGE_SIZE,
        cursor: mode === 'append' ? params.cursor : params.cursor ?? undefined,
      });
      const items = page.items;
      const domain = items.map(mapLegacyConversationToDomain);

      const pageMeta = {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
      pageMetaByFilterKey.set(filterKey, pageMeta);

      if (generation !== loadInboxGeneration) {
        return {
          items,
          domain,
          applied: false,
          stale: true,
          ...pageMeta,
          source: page.source,
        };
      }

      if (!shouldUseChatDomainStore()) {
        const result: LoadInboxResult = {
          items,
          domain,
          applied: false,
          stale: false,
          ...pageMeta,
          source: page.source,
        };
        if (mode === 'replace') {
          lastSuccessByFilterKey.set(filterKey, {
            at: Date.now(),
            result,
            ...pageMeta,
          });
        }
        return result;
      }

      const allowEmpty = params.allowEmpty === true;
      if (!shouldWriteToStore(items, allowEmpty) && mode === 'replace') {
        return {
          items,
          domain,
          applied: false,
          stale: false,
          ...pageMeta,
          source: page.source,
        };
      }

      const applied = writeInboxToStore(items, generation, mode);
      const result: LoadInboxResult = {
        items,
        domain,
        applied,
        stale: !applied && generation !== loadInboxGeneration,
        ...pageMeta,
        source: page.source,
      };
      if (mode === 'replace' && applied) {
        lastSuccessByFilterKey.set(filterKey, {
          at: Date.now(),
          result,
          ...pageMeta,
        });
      }
      return result;
    } finally {
      inFlight.delete(loadKey);
    }
  })();

  inFlight.set(loadKey, task);
  return task;
}

/**
 * TF6 — próxima página da inbox (append no Store / items para UI local).
 */
export async function loadMoreInboxCommand(
  params: Omit<LoadInboxParams, 'mode' | 'cursor'> & { cursor?: string | null },
): Promise<LoadInboxResult> {
  const meta = getInboxPageMeta(params);
  const cursor = params.cursor ?? meta.nextCursor;
  if (!cursor && !meta.hasMore) {
    return {
      items: [],
      domain: [],
      applied: false,
      stale: false,
      nextCursor: null,
      hasMore: false,
      source: 'cache',
    };
  }
  return loadInboxCommand({
    ...params,
    cursor,
    mode: 'append',
    force: true,
    limit: params.limit ?? DEFAULT_INBOX_PAGE_SIZE,
  });
}

export { mergeConversationLists, DEFAULT_INBOX_PAGE_SIZE };
export type { LoadInboxSurface };
