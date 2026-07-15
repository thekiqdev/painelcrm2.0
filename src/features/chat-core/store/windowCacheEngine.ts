/**
 * F6.2 — Sliding Window Engine (puro: registro, LRU, eviction, memória).
 * Não altera Message Merge Engine nem Cursor Engine.
 */

import type { ChatConversationId, ChatMessageId } from '../domain/types';
import {
  DEFAULT_WINDOW_CACHE_LIMITS,
  type ConversationWindowState,
  type MessagePageId,
  type MessagePageRecord,
  type WindowCacheLimits,
} from './windowCacheTypes';

let limitsOverride: Partial<WindowCacheLimits> | null = null;

export function setWindowCacheLimitsForTests(
  partial: Partial<WindowCacheLimits> | null,
): void {
  limitsOverride = partial;
}

export function getWindowCacheLimits(): WindowCacheLimits {
  return { ...DEFAULT_WINDOW_CACHE_LIMITS, ...limitsOverride };
}

export function createEmptyConversationWindow(): ConversationWindowState {
  return {
    residentPageIds: [],
    cachedPages: {},
    evictedPageIds: [],
    windowStart: 0,
    windowEnd: -1,
    memoryFootprint: 0,
    pinnedPageIds: [],
  };
}

export function estimateMessagesBytes(
  messageCount: number,
  limits: WindowCacheLimits = getWindowCacheLimits(),
): number {
  return messageCount * limits.bytesPerMessage;
}

export function makeMessagePageId(
  conversationId: ChatConversationId,
  pageIndex: number,
  oldestMessageId: ChatMessageId | null,
): MessagePageId {
  return `${conversationId}:p${pageIndex}:${oldestMessageId ?? 'empty'}`;
}

export function buildPageRecord(params: {
  conversationId: ChatConversationId;
  pageIndex: number;
  messageIds: readonly ChatMessageId[];
  cursorAtLoad?: string | null;
  pinned?: boolean;
  now?: number;
}): MessagePageRecord {
  const now = params.now ?? Date.now();
  const ids = [...params.messageIds];
  const oldest = ids[0] ?? null;
  const newest = ids.length > 0 ? ids[ids.length - 1]! : null;
  return {
    id: makeMessagePageId(params.conversationId, params.pageIndex, oldest),
    conversationId: params.conversationId,
    messageIds: ids,
    oldestMessageId: oldest,
    newestMessageId: newest,
    cursorAtLoad: params.cursorAtLoad ?? null,
    loadedAt: now,
    lastAccessAt: now,
    pinned: params.pinned ?? false,
    status: params.pinned ? 'Pinned' : 'Resident',
  };
}

function recomputeWindowBounds(residentIds: MessagePageId[]): {
  windowStart: number;
  windowEnd: number;
} {
  if (residentIds.length === 0) return { windowStart: 0, windowEnd: -1 };
  return { windowStart: 0, windowEnd: residentIds.length - 1 };
}

function recomputeMemory(
  cachedPages: Record<MessagePageId, MessagePageRecord>,
  residentIds: MessagePageId[],
  limits: WindowCacheLimits,
): number {
  let count = 0;
  for (const id of residentIds) {
    count += cachedPages[id]?.messageIds.length ?? 0;
  }
  return estimateMessagesBytes(count, limits);
}

/**
 * Registra página como residente (mais antiga = prepend → início; initial = única).
 * `position: 'older'` insere no início da lista residente; `'newer'` no fim.
 */
export function registerPageInWindow(
  window: ConversationWindowState,
  page: MessagePageRecord,
  position: 'older' | 'newer' | 'replace' = 'older',
  limits: WindowCacheLimits = getWindowCacheLimits(),
): ConversationWindowState {
  const cachedPages = { ...window.cachedPages, [page.id]: page };
  let residentPageIds = [...window.residentPageIds];
  let evictedPageIds = window.evictedPageIds.filter((id) => id !== page.id);

  if (position === 'replace') {
    residentPageIds = [page.id];
  } else if (!residentPageIds.includes(page.id)) {
    residentPageIds =
      position === 'older' ? [page.id, ...residentPageIds] : [...residentPageIds, page.id];
  }

  // Newest page always pinned (viewport default no fim da thread).
  const newestId = residentPageIds[residentPageIds.length - 1] ?? null;
  const pinnedPageIds = newestId ? [newestId] : [];
  for (const id of residentPageIds) {
    const rec = cachedPages[id];
    if (!rec) continue;
    const pinned = pinnedPageIds.includes(id);
    cachedPages[id] = {
      ...rec,
      pinned,
      status: pinned ? 'Pinned' : 'Resident',
      lastAccessAt: id === page.id ? page.lastAccessAt : rec.lastAccessAt,
    };
  }

  const bounds = recomputeWindowBounds(residentPageIds);
  return {
    residentPageIds,
    cachedPages,
    evictedPageIds,
    windowStart: bounds.windowStart,
    windowEnd: bounds.windowEnd,
    memoryFootprint: recomputeMemory(cachedPages, residentPageIds, limits),
    pinnedPageIds,
  };
}

export type EvictionPlan = {
  pageIdsToEvict: MessagePageId[];
  messageIdsToRemove: ChatMessageId[];
};

/**
 * LRU entre páginas não pinned; prioriza as mais distantes do viewport (mais antigas).
 */
export function planWindowEviction(
  window: ConversationWindowState,
  limits: WindowCacheLimits = getWindowCacheLimits(),
): EvictionPlan {
  const pageOver = Math.max(0, window.residentPageIds.length - limits.maxResidentPages);
  let messageCount = 0;
  for (const id of window.residentPageIds) {
    messageCount += window.cachedPages[id]?.messageIds.length ?? 0;
  }
  if (pageOver <= 0 && messageCount <= limits.maxMessagesEstimate) {
    return { pageIdsToEvict: [], messageIdsToRemove: [] };
  }

  const pinned = new Set(window.pinnedPageIds);
  // Candidatos: residentes não pinned, preferência pelas mais antigas (início da lista).
  const candidates = window.residentPageIds.filter((id) => !pinned.has(id));
  // LRU tie-break: menor lastAccessAt primeiro; estáveis pela ordem oldest→newest.
  candidates.sort((a, b) => {
    const ra = window.cachedPages[a]?.lastAccessAt ?? 0;
    const rb = window.cachedPages[b]?.lastAccessAt ?? 0;
    if (ra !== rb) return ra - rb;
    return window.residentPageIds.indexOf(a) - window.residentPageIds.indexOf(b);
  });

  // Evict until under both page and message limits (or no candidates left).
  const pageIdsToEvict: MessagePageId[] = [];
  let remainingResidents = window.residentPageIds.length;
  let remainingMessages = messageCount;
  for (const candidate of candidates) {
    if (
      remainingResidents <= limits.maxResidentPages &&
      remainingMessages <= limits.maxMessagesEstimate
    ) {
      break;
    }
    pageIdsToEvict.push(candidate);
    remainingResidents -= 1;
    remainingMessages -= window.cachedPages[candidate]?.messageIds.length ?? 0;
  }
  const messageIdsToRemove: ChatMessageId[] = [];
  const keepIds = new Set(
    window.residentPageIds.filter((id) => !pageIdsToEvict.includes(id)),
  );

  for (const pageId of pageIdsToEvict) {
    const page = window.cachedPages[pageId];
    if (!page) continue;
    for (const mid of page.messageIds) {
      // Não remover se outra página residente ainda referencia.
      let shared = false;
      for (const keepId of keepIds) {
        if (window.cachedPages[keepId]?.messageIds.includes(mid)) {
          shared = true;
          break;
        }
      }
      if (!shared) messageIdsToRemove.push(mid);
    }
  }

  return { pageIdsToEvict, messageIdsToRemove };
}

export function applyEvictionToWindow(
  window: ConversationWindowState,
  plan: EvictionPlan,
  limits: WindowCacheLimits = getWindowCacheLimits(),
): ConversationWindowState {
  if (plan.pageIdsToEvict.length === 0) return window;

  const cachedPages = { ...window.cachedPages };
  const evictSet = new Set(plan.pageIdsToEvict);
  const residentPageIds = window.residentPageIds.filter((id) => !evictSet.has(id));
  const evictedPageIds = [...window.evictedPageIds];

  for (const pageId of plan.pageIdsToEvict) {
    const page = cachedPages[pageId];
    if (!page) continue;
    cachedPages[pageId] = {
      ...page,
      status: 'Evicted',
      pinned: false,
      // Mantém messageIds metadata para reload; mensagens saem do byId no reducer.
    };
    if (!evictedPageIds.includes(pageId)) evictedPageIds.push(pageId);
  }

  const newestId = residentPageIds[residentPageIds.length - 1] ?? null;
  const pinnedPageIds = newestId ? [newestId] : [];
  for (const id of residentPageIds) {
    const rec = cachedPages[id];
    if (!rec) continue;
    const pinned = pinnedPageIds.includes(id);
    cachedPages[id] = {
      ...rec,
      pinned,
      status: pinned ? 'Pinned' : 'Resident',
    };
  }

  const bounds = recomputeWindowBounds(residentPageIds);
  return {
    residentPageIds,
    cachedPages,
    evictedPageIds,
    windowStart: bounds.windowStart,
    windowEnd: bounds.windowEnd,
    memoryFootprint: recomputeMemory(cachedPages, residentPageIds, limits),
    pinnedPageIds,
  };
}

/** Trim completo: planeja + aplica eviction. */
export function trimConversationWindow(
  window: ConversationWindowState,
  limits: WindowCacheLimits = getWindowCacheLimits(),
): { window: ConversationWindowState; plan: EvictionPlan } {
  const plan = planWindowEviction(window, limits);
  return { window: applyEvictionToWindow(window, plan, limits), plan };
}

export function touchPageAccess(
  window: ConversationWindowState,
  pageId: MessagePageId,
  now = Date.now(),
): ConversationWindowState {
  const page = window.cachedPages[pageId];
  if (!page) return window;
  return {
    ...window,
    cachedPages: {
      ...window.cachedPages,
      [pageId]: { ...page, lastAccessAt: now },
    },
  };
}

export function markPageReloaded(
  window: ConversationWindowState,
  page: MessagePageRecord,
  limits: WindowCacheLimits = getWindowCacheLimits(),
): ConversationWindowState {
  const withRegister = registerPageInWindow(
    {
      ...window,
      evictedPageIds: window.evictedPageIds.filter((id) => id !== page.id),
    },
    { ...page, status: 'Reloaded', lastAccessAt: Date.now() },
    'older',
    limits,
  );
  return trimConversationWindow(withRegister, limits).window;
}

export function readConversationWindowFromMaps(params: {
  residentPages?: MessagePageId[];
  cachedPages?: Record<MessagePageId, MessagePageRecord>;
  evictedPages?: MessagePageId[];
  windowStart?: number;
  windowEnd?: number;
  memoryFootprint?: number;
  pinnedPages?: MessagePageId[];
}): ConversationWindowState {
  const residentPageIds = params.residentPages ?? [];
  const cachedPages = params.cachedPages ?? {};
  const pinnedPageIds =
    params.pinnedPages ??
    (residentPageIds.length > 0 ? [residentPageIds[residentPageIds.length - 1]!] : []);
  return {
    residentPageIds,
    cachedPages,
    evictedPageIds: params.evictedPages ?? [],
    windowStart: params.windowStart ?? 0,
    windowEnd: params.windowEnd ?? (residentPageIds.length > 0 ? residentPageIds.length - 1 : -1),
    memoryFootprint: params.memoryFootprint ?? 0,
    pinnedPageIds,
  };
}
