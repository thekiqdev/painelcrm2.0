/**
 * F5.9 — único pipeline Repository → Command → Domain Store (inbox).
 * TF6 — limit=50, cursor/load-more, coalesce.
 * TF7 E2 — freshness TTL longo + skip GET (WS connected vs disconnected).
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatDomainConversation } from '../domain/types';
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
import {
  chatRealtimeBridge,
  subscribeChatRealtimeBridgeStatus,
} from '../realtime/bridge';
import {
  clearChatPageCacheForSession,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { logInboxCacheEvent } from './inboxCacheDiag';

export type LoadInboxParams = LoadInboxFetchParams & {
  /** Quando true, permite gravar lista vazia no Store. */
  allowEmpty?: boolean;
  /** replace = 1ª página; append = “Carregar mais”. */
  mode?: 'replace' | 'append';
  /** Ignora freshness / in-flight stale short-circuit. */
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

/** TTL legado TF6 (coalesce curto) — mantido para compat; E2 usa FRESH. */
export const INBOX_LOAD_TTL_MS = 20_000;

/** TF7 E2 — skip GET enquanto fresco e WS conectado (SPA + pós-warm). */
export const INBOX_FRESH_TTL_MS = 5 * 60_000;

/** TF7 E2 — TTL mais curto quando realtime não está connected (missed events). */
export const INBOX_FRESH_TTL_DISCONNECTED_MS = 30_000;

let loadInboxGeneration = 0;
const inFlight = new Map<string, Promise<LoadInboxResult>>();

type InboxSuccessCache = {
  at: number;
  result: LoadInboxResult;
  nextCursor: string | null;
  hasMore: boolean;
};

/** Chave sem `surface` — Chat e Float compartilham freshness (TF7 E2 / 2.5). */
const lastSuccessByFreshnessKey = new Map<string, InboxSuccessCache>();
const pageMetaByFreshnessKey = new Map<string, { nextCursor: string | null; hasMore: boolean }>();

/** TF8 E1 — um soft reconcile pendente após seed disk com WS down. */
let pendingSoftReconcileParams: LoadInboxParams | null = null;
let softReconcileStatusUnsub: (() => void) | null = null;

function buildFreshnessKey(params: LoadInboxParams): string {
  const {
    instanceIds,
    inboxScope,
    quickFilter = 'all',
    attendanceFilter = '',
    channelOrigin = 'all',
    conversationFilter,
    allowEmpty = false,
  } = params;
  return JSON.stringify({
    ids: [...instanceIds].sort(),
    inboxScope,
    quickFilter,
    attendanceFilter: attendanceFilter ?? '',
    channelOrigin,
    conversationFilter: conversationFilter ?? '',
    allowEmpty,
  });
}

function buildLoadKey(params: LoadInboxParams): string {
  return JSON.stringify({
    filter: buildFreshnessKey(params),
    cursor: params.cursor ?? null,
    mode: params.mode ?? 'replace',
    limit: params.limit ?? DEFAULT_INBOX_PAGE_SIZE,
  });
}

/** True se o bridge/socket realtime está apto a manter a inbox fresca via WS. */
export function isChatRealtimeConnectedForInboxFresh(): boolean {
  try {
    if (chatRealtimeBridge.status === 'connected') return true;
    return chatRealtimeBridge.getSocket()?.connected === true;
  } catch {
    return false;
  }
}

export function getEffectiveInboxFreshTtlMs(): number {
  return isChatRealtimeConnectedForInboxFresh()
    ? INBOX_FRESH_TTL_MS
    : INBOX_FRESH_TTL_DISCONNECTED_MS;
}

function shouldWriteToStore(items: ChatConversation[], allowEmpty: boolean): boolean {
  if (items.length > 0) return true;
  if (allowEmpty) return true;
  return readStoreConversationCount() === 0;
}

/**
 * Filtros de attendance / quick (Fila, Minhas, etc.) podem legitimamente devolver lista vazia.
 * Sem allowEmpty o Store singleton mantinha a lista do filtro anterior.
 */
function resolveAllowEmpty(params: LoadInboxParams): boolean {
  if (params.allowEmpty === true) return true;
  const attendance = params.attendanceFilter ?? '';
  if (attendance !== '') return true;
  const quick = params.quickFilter ?? 'all';
  return quick !== 'all';
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

function resultFromStore(meta: { nextCursor: string | null; hasMore: boolean }): LoadInboxResult {
  const store = getChatDomainStoreSession();
  const items = store ? selectConversationsForUi(store.getState()) : [];
  const domain = items.map(mapLegacyConversationToDomain);
  return {
    items,
    domain,
    applied: false,
    stale: false,
    nextCursor: meta.nextCursor,
    hasMore: meta.hasMore,
    source: 'cache',
  };
}

/**
 * TF7 E2 / TF8 E1 — após warm, semeia freshness a partir de `chatPageCache.updatedAt`.
 * Seed de disk usa sempre TTL **longo** (5 min), independente do WS no instante do F5.
 * Revalidate em sessão continua via `getEffectiveInboxFreshTtlMs()` em `loadInboxCommand`.
 */
export function markInboxFreshFromClient(params: LoadInboxParams, at: number): boolean {
  if (!shouldUseChatDomainStore()) return false;
  if (!Number.isFinite(at) || at <= 0) return false;
  if (readStoreConversationCount() <= 0) return false;

  const freshnessKey = buildFreshnessKey(params);
  const age = Date.now() - at;
  // TF8 E1: seed disk ≠ TTL disconnected (30s)
  if (age < 0 || age >= INBOX_FRESH_TTL_MS) return false;

  const meta = pageMetaByFreshnessKey.get(freshnessKey) ?? {
    nextCursor: null,
    hasMore: false,
  };
  const result = resultFromStore(meta);
  // `at` = agora: permite skip imediato no boot mesmo com WS down (TTL sessão 30s).
  // A frescura do disk já foi validada acima com INBOX_FRESH_TTL_MS.
  lastSuccessByFreshnessKey.set(freshnessKey, {
    at: Date.now(),
    result,
    ...meta,
  });
  return true;
}

function ensureSoftReconcileWired(): void {
  if (softReconcileStatusUnsub) return;
  softReconcileStatusUnsub = subscribeChatRealtimeBridgeStatus((status) => {
    if (status !== 'connected') return;
    flushPendingInboxSoftReconcile();
  });
}

/**
 * TF8 E1 — após seed+skip com WS down, agenda 1× force quando o realtime conectar.
 * Se WS já connected: no-op (SPA / sessão viva — TTL cobre).
 */
export function scheduleInboxSoftReconcileOnRealtimeConnected(params: LoadInboxParams): void {
  if (!shouldUseChatDomainStore()) return;
  if (isChatRealtimeConnectedForInboxFresh()) {
    logInboxCacheEvent('inbox_soft_reconcile', { scheduled: false, reason: 'ws_already_connected' });
    return;
  }
  pendingSoftReconcileParams = {
    ...params,
    mode: 'replace',
    force: undefined,
  };
  ensureSoftReconcileWired();
  logInboxCacheEvent('inbox_soft_reconcile', { scheduled: true, reason: 'await_ws_connected' });
}

function flushPendingInboxSoftReconcile(): void {
  const pending = pendingSoftReconcileParams;
  if (!pending) return;
  pendingSoftReconcileParams = null;
  logInboxCacheEvent('inbox_soft_reconcile', { scheduled: false, reason: 'ws_connected_force' });
  void loadInboxCommand({
    ...pending,
    force: true,
    mode: 'replace',
  });
}

/** @internal testes */
export function getPendingInboxSoftReconcileForTests(): LoadInboxParams | null {
  return pendingSoftReconcileParams;
}

/** @internal testes — simula bridge connected. */
export function flushInboxSoftReconcileForTests(): void {
  flushPendingInboxSoftReconcile();
}

/** TF7 E3 / TF8 — limpa freshness/in-flight sem esvaziar o Store. */
export function invalidateInboxFreshness(): void {
  loadInboxGeneration += 1;
  inFlight.clear();
  lastSuccessByFreshnessKey.clear();
  pageMetaByFreshnessKey.clear();
  pendingSoftReconcileParams = null;
}

/**
 * TF7 E3 — force GET da inbox (ignora TTL).
 * Com `clearPageCacheScope`, apaga localStorage e força rede (hard sync).
 */
export async function forceReloadInboxCommand(
  params: LoadInboxParams,
  options?: { clearPageCacheScope?: ChatPageCacheScope },
): Promise<LoadInboxResult> {
  invalidateInboxFreshness();
  if (options?.clearPageCacheScope) {
    clearChatPageCacheForSession(options.clearPageCacheScope);
  }
  return loadInboxCommand({
    ...params,
    force: true,
    mode: 'replace',
  });
}

/** Invalida loads em voo e opcionalmente limpa o Store. */
export function clearInboxCommand(options?: { allowEmpty?: boolean }): void {
  invalidateInboxFreshness();
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
    pageMetaByFreshnessKey.get(buildFreshnessKey(params)) ?? {
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
  lastSuccessByFreshnessKey.clear();
  pageMetaByFreshnessKey.clear();
  pendingSoftReconcileParams = null;
}

/**
 * Único command oficial de hidratação de inbox.
 * Repository → normalização → Store (quando CHAT_CORE_STORE ON).
 */
export async function loadInboxCommand(params: LoadInboxParams): Promise<LoadInboxResult> {
  const mode = params.mode ?? 'replace';
  const freshnessKey = buildFreshnessKey(params);
  const force = params.force === true;

  if (mode === 'replace' && !force && shouldUseChatDomainStore()) {
    const cached = lastSuccessByFreshnessKey.get(freshnessKey);
    const ttl = getEffectiveInboxFreshTtlMs();
    if (
      cached &&
      Date.now() - cached.at < ttl &&
      (readStoreConversationCount() > 0 || cached.result.items.length > 0 || resolveAllowEmpty(params))
    ) {
      // Store é singleton entre Fila/Minhas/etc. — reaplicar a lista deste filtro
      // (senão o skip GET deixa a UI com conversas do filtro anterior).
      const allowEmpty = resolveAllowEmpty(params);
      const applied = shouldWriteToStore(cached.result.items, allowEmpty)
        ? writeInboxToStore(cached.result.items, loadInboxGeneration, 'replace')
        : false;
      logInboxCacheEvent('inbox_fetch_skipped_fresh', {
        ttlMs: ttl,
        ageMs: Date.now() - cached.at,
        storeCount: readStoreConversationCount(),
        reason: isChatRealtimeConnectedForInboxFresh() ? 'ws_connected' : 'disk_seed_or_session',
        wsConnected: isChatRealtimeConnectedForInboxFresh(),
        reapplied: applied,
      });
      return {
        ...cached.result,
        applied,
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
      if (mode === 'replace') {
        logInboxCacheEvent('inbox_fetch_network', { force, storeCount: readStoreConversationCount() });
      }
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
      pageMetaByFreshnessKey.set(freshnessKey, pageMeta);

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
          lastSuccessByFreshnessKey.set(freshnessKey, {
            at: Date.now(),
            result,
            ...pageMeta,
          });
        }
        return result;
      }

      const allowEmpty = resolveAllowEmpty(params);
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
        lastSuccessByFreshnessKey.set(freshnessKey, {
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
 * TF8 E4 — se um loadInbox (ex. limit=50) já está em voo, o bubble pode juntar-se
 * em vez de abrir GET limit=4 paralelo.
 */
export function getInFlightInboxLoad(
  params: LoadInboxParams,
): Promise<LoadInboxResult> | null {
  const loadKey = buildLoadKey({
    ...params,
    mode: params.mode ?? 'replace',
    limit: params.limit ?? DEFAULT_INBOX_PAGE_SIZE,
  });
  return inFlight.get(loadKey) ?? null;
}

/** TF8 E4 — items da última inbox fresca (sem HTTP). */
export function peekFreshInboxItems(params: LoadInboxParams): ChatConversation[] | null {
  const freshnessKey = buildFreshnessKey(params);
  const cached = lastSuccessByFreshnessKey.get(freshnessKey);
  if (!cached) return null;
  if (Date.now() - cached.at >= getEffectiveInboxFreshTtlMs()) return null;
  return cached.result.items;
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
