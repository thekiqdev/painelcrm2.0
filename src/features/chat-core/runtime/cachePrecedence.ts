/**
 * MB-031 / Phase 11 — precedência de cache Chat (SoT).
 * Domain Store > React Query (satellite / Store OFF legacy) > IndexedDB (persist auxiliar).
 *
 * ADR-013: Domain Store é o Runtime Core quando CHAT_CORE_STORE=ON.
 * Remoção física do path OFF = MB-028 (não Phase 11 Sprint 6).
 */

import { shouldUseChatDomainStore } from '../store/flags';

export type ChatCacheLayer = 'domain-store' | 'react-query' | 'indexeddb';

/** Ownership de leitura primária da inbox/thread quando Store ON. */
export function getChatPrimaryCacheLayer(): ChatCacheLayer {
  if (shouldUseChatDomainStore()) return 'domain-store';
  return 'react-query';
}

/**
 * RQ pode hidratar UI só quando NÃO é SoT (legado coexistente / rollback).
 * IDB nunca é SoT — apenas warm/persist.
 */
export function shouldReactQueryOwnChatThread(): boolean {
  return getChatPrimaryCacheLayer() === 'react-query';
}

/** Alias Phase 11 — meta/header seguem a mesma precedência da thread. */
export function shouldReactQueryOwnConversationMeta(): boolean {
  return shouldReactQueryOwnChatThread();
}

/** True enquanto CHAT_CORE_STORE está OFF (path legado ativo). */
export function isChatStoreOffLegacyPathActive(): boolean {
  return !shouldUseChatDomainStore();
}

export function shouldIndexedDbActAsSourceOfTruth(): boolean {
  return false;
}

export const CHAT_CACHE_PRECEDENCE_DOC = {
  primary: 'domain-store when CHAT_CORE_STORE=ON (ADR-013 Runtime Core)',
  secondary: 'react-query satellite / STORE OFF legacy rollback (MB-028 delete gate)',
  tertiary: 'indexeddb persist warm (never SoT)',
} as const;

export const PHASE11_LEGACY_RETIREMENT_DOC = {
  adr: 'ADR-013',
  physicalRemoval: 'MB-028 after Store ON canary',
  kanban: 'Sprint 5 Option A — board projection outside Runtime Core',
} as const;
