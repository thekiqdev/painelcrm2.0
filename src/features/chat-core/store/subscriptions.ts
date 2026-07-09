/**
 * F5.0 — subscriptions internas do Domain Store.
 */

import type { ChatDomainAction, ChatDomainListener, ChatDomainState } from './types';

export type ChatDomainSubscriptionRegistry = {
  subscribe(listener: ChatDomainListener): () => void;
  unsubscribe(listener: ChatDomainListener): void;
  notify(state: ChatDomainState, action: ChatDomainAction): void;
  clear(): void;
  size(): number;
};

export function createChatDomainSubscriptionRegistry(): ChatDomainSubscriptionRegistry {
  const listeners = new Set<ChatDomainListener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unsubscribe(listener) {
      listeners.delete(listener);
    },
    notify(state, action) {
      for (const listener of listeners) {
        listener(state, action);
      }
    },
    clear() {
      listeners.clear();
    },
    size() {
      return listeners.size;
    },
  };
}
