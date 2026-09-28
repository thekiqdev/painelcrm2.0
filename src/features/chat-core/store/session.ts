/**
 * F5.1 — instância de sessão do Domain Store (shadow, chat-core only).
 */

import { createChatDomainStore } from './createStore';
import type { ChatDomainStore } from './types';
import { shouldUseChatDomainStore } from './flags';
import { auditAssignSessionId, auditLogStoreSnapshot } from './f5HydrationAudit';

let sessionStore: ChatDomainStore | null = null;
let sessionCounter = 0;

export function getChatDomainStoreSession(): ChatDomainStore | null {
  if (!shouldUseChatDomainStore()) return null;
  if (!sessionStore) {
    sessionCounter += 1;
    sessionStore = createChatDomainStore();
    auditAssignSessionId(sessionCounter);
    auditLogStoreSnapshot('session-created', sessionStore.getState());
  }
  return sessionStore;
}

/** Garante sessão singleton antes da UI subscrever via useSyncExternalStore. */
export function ensureChatDomainStoreSession(): ChatDomainStore | null {
  return getChatDomainStoreSession();
}

export function resetChatDomainStoreSession(): void {
  sessionStore?.reset();
  sessionStore = null;
}

/** Testes — substitui instância de sessão. */
export function setChatDomainStoreSessionForTests(store: ChatDomainStore | null): void {
  sessionStore = store;
}
