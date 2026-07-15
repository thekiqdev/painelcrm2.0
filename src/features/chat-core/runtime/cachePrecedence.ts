/**
 * MB-031 — precedência de cache Chat (SoT).
 * Domain Store > React Query (satellite) > IndexedDB (persist auxiliar).
 */

import { shouldUseChatDomainStore } from '../store/flags';

export type ChatCacheLayer = 'domain-store' | 'react-query' | 'indexeddb';

/** Ownership de leitura primária da inbox/thread quando Store ON. */
export function getChatPrimaryCacheLayer(): ChatCacheLayer {
  if (shouldUseChatDomainStore()) return 'domain-store';
  return 'react-query';
}

/**
 * RQ pode hidratar UI só quando NÃO é SoT (legado coexistente).
 * IDB nunca é SoT — apenas warm/persist.
 */
export function shouldReactQueryOwnChatThread(): boolean {
  return getChatPrimaryCacheLayer() === 'react-query';
}

export function shouldIndexedDbActAsSourceOfTruth(): boolean {
  return false;
}

export const CHAT_CACHE_PRECEDENCE_DOC = {
  primary: 'domain-store when CHAT_CORE_STORE=ON',
  secondary: 'react-query satellite / STORE OFF legacy',
  tertiary: 'indexeddb persist warm (never SoT)',
} as const;
