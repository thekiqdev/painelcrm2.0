/**
 * F5.1 — hydration do Domain Store (shadow).
 */

import { syncStoreFromRepositoryResponse } from './integration';
import type { ChatDomainHydration } from './types';
import type { RepositorySyncSource } from './repositorySync';

type HydrationSnapshot = {
  source?: RepositorySyncSource;
  payload?: unknown;
};

export function createChatDomainHydration(): ChatDomainHydration {
  return {
    hydrateFromRepository(snapshot: unknown): void {
      const parsed =
        snapshot && typeof snapshot === 'object'
          ? (snapshot as HydrationSnapshot)
          : { payload: snapshot };
      const source = parsed.source ?? 'listConversations';
      if (parsed.payload !== undefined) {
        syncStoreFromRepositoryResponse(source, parsed.payload);
      }
    },
    markHydrated(_scope: 'conversations' | 'messages' | 'instances'): void {
      /* reservado F5.2+ */
    },
  };
}
