/**
 * F5.0 — factory do Domain Store.
 * Sem singleton global; cada chamada retorna instância isolada.
 */

import { reduceChatDomainState } from './actions';
import { createChatDomainEventBus } from './events';
import { createChatDomainHydration } from './hydration';
import { createChatDomainPersistence } from './persistence';
import { chatDomainSelectors } from './selectors';
import { createInitialChatDomainState } from './state';
import { createChatDomainSubscriptionRegistry } from './subscriptions';
import type { ChatDomainAction, ChatDomainState, ChatDomainStore } from './types';
import { auditLogDispatch } from './f5HydrationAudit';

export type CreateChatDomainStoreOptions = {
  initialState?: Partial<ChatDomainState>;
};

export function createChatDomainStore(
  options: CreateChatDomainStoreOptions = {},
): ChatDomainStore {
  const subscriptions = createChatDomainSubscriptionRegistry();
  let state = mergeInitialState(options.initialState);

  const dispatch = (action: ChatDomainAction): void => {
    const before = state;
    state = reduceChatDomainState(state, action);
    auditLogDispatch(action, before, state);
    subscriptions.notify(state, action);
  };

  const store: ChatDomainStore = {
    version: 'F5.6',
    getState: () => state,
    dispatch,
    subscribe(listener) {
      return subscriptions.subscribe(listener);
    },
    reset() {
      dispatch({ type: 'store/reset' });
    },
    selectors: chatDomainSelectors,
    events: createChatDomainEventBus(),
    hydration: createChatDomainHydration(),
    persistence: createChatDomainPersistence(),
  };

  return store;
}

function mergeInitialState(partial?: Partial<ChatDomainState>): ChatDomainState {
  const base = createInitialChatDomainState();
  if (!partial) return base;
  return reduceChatDomainState(base, { type: 'hydrate/partial', state: partial });
}
