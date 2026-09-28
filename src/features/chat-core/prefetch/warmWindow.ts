/**
 * F6.6 — Warm Window Engine.
 * Mantém conversas recentemente abertas / pré-aquecidas em memória (LRU).
 * Lê Window Cache apenas via selectors (não altera o engine).
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from '../store/types';
import { selectResidentPages } from '../store/windowSelectors';
import { selectMessageCount } from '../store/messageSelectors';
import {
  recordWarmWindowHit,
  recordWarmWindowMiss,
} from '../metrics/prefetchMetrics';

/**
 * TF8 E3 — Cap warmup de mensagens (selected + 0–1 vizinho).
 * Antes F6.6 usava 5; em F5 gerava 5× GET /messages em sequência.
 */
export const DEFAULT_WARM_CONVERSATION_COUNT = 2;

export type WarmWindowEntry = {
  conversationId: ChatConversationId;
  warmedAt: number;
  openCount: number;
  lastOpenedAt: number;
};

export type WarmWindowEngine = {
  /** Marca conversa como aquecida (LRU). */
  markWarm(conversationId: ChatConversationId, nowMs?: number): void;
  /** Regista abertura do utilizador (heat + warm). */
  recordOpen(conversationId: ChatConversationId, nowMs?: number): void;
  isWarm(conversationId: ChatConversationId): boolean;
  getWarmIds(): ChatConversationId[];
  getEntry(conversationId: ChatConversationId): WarmWindowEntry | null;
  getLastOpenedId(): ChatConversationId | null;
  clear(): void;
  size(): number;
  /** Hit/miss ao abrir: já residente no Domain Store / warm set. */
  noteOpenOutcome(
    conversationId: ChatConversationId,
    state: ChatDomainState | null,
  ): 'hit' | 'miss';
};

/**
 * Conversa já tem mensagens / páginas residentes — não precisa prefetch.
 * Respeita Window Cache (só leitura).
 */
export function isConversationAlreadyWarm(
  state: ChatDomainState | null | undefined,
  conversationId: ChatConversationId,
): boolean {
  if (!state) return false;
  if (selectMessageCount(state, conversationId) > 0) return true;
  return selectResidentPages(state, conversationId).length > 0;
}

export function createWarmWindowEngine(
  capacity: number = DEFAULT_WARM_CONVERSATION_COUNT,
): WarmWindowEngine {
  const limit = Math.max(1, capacity);
  const byId = new Map<ChatConversationId, WarmWindowEntry>();
  let lru: ChatConversationId[] = [];
  let lastOpenedId: ChatConversationId | null = null;

  const touchLru = (id: ChatConversationId) => {
    lru = lru.filter((x) => x !== id);
    lru.push(id);
    while (lru.length > limit) {
      const evicted = lru.shift();
      if (evicted) byId.delete(evicted);
    }
  };

  const ensure = (id: ChatConversationId, nowMs: number): WarmWindowEntry => {
    const prev = byId.get(id);
    if (prev) {
      touchLru(id);
      return prev;
    }
    const entry: WarmWindowEntry = {
      conversationId: id,
      warmedAt: nowMs,
      openCount: 0,
      lastOpenedAt: 0,
    };
    byId.set(id, entry);
    touchLru(id);
    return entry;
  };

  return {
    markWarm(conversationId, nowMs = Date.now()) {
      const entry = ensure(conversationId, nowMs);
      entry.warmedAt = nowMs;
    },
    recordOpen(conversationId, nowMs = Date.now()) {
      const entry = ensure(conversationId, nowMs);
      entry.openCount += 1;
      entry.lastOpenedAt = nowMs;
      entry.warmedAt = nowMs;
      lastOpenedId = conversationId;
    },
    isWarm(conversationId) {
      return byId.has(conversationId);
    },
    getWarmIds() {
      return [...lru].reverse();
    },
    getEntry(conversationId) {
      return byId.get(conversationId) ?? null;
    },
    getLastOpenedId() {
      return lastOpenedId;
    },
    clear() {
      byId.clear();
      lru = [];
      lastOpenedId = null;
    },
    size() {
      return byId.size;
    },
    noteOpenOutcome(conversationId, state) {
      if (isConversationAlreadyWarm(state, conversationId) || byId.has(conversationId)) {
        recordWarmWindowHit(conversationId);
        return 'hit';
      }
      recordWarmWindowMiss(conversationId);
      return 'miss';
    },
  };
}

/** Sessão singleton do Warm Window (Chat principal). */
let sessionEngine: WarmWindowEngine | null = null;
let sessionCapacity = 0;

export function getWarmWindowEngine(
  capacity: number = DEFAULT_WARM_CONVERSATION_COUNT,
): WarmWindowEngine {
  const limit = Math.max(1, capacity);
  if (!sessionEngine || sessionCapacity !== limit) {
    sessionEngine = createWarmWindowEngine(limit);
    sessionCapacity = limit;
  }
  return sessionEngine;
}

/** @internal testes */
export function resetWarmWindowEngineForTests(): void {
  sessionEngine?.clear();
  sessionEngine = null;
  sessionCapacity = 0;
}
