/**
 * F5.0 / F6.5 — factory do Domain Store.
 * F6.5: dispatchBatch aplica N actions e notifica uma vez.
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
import { timeReducer } from '../metrics/reducerMetrics';
import { sampleStoreMemory } from '../metrics/memoryMetrics';
import { isChatPerformanceTelemetryEnabled } from '../metrics/performanceMetrics';
import { noteBatchCommit, type ChatDomainStoreWithBatch } from './storeBatch';

export type CreateChatDomainStoreOptions = {
  initialState?: Partial<ChatDomainState>;
};

export function createChatDomainStore(
  options: CreateChatDomainStoreOptions = {},
): ChatDomainStoreWithBatch {
  const subscriptions = createChatDomainSubscriptionRegistry();
  let state = mergeInitialState(options.initialState);
  let suspendNotify = false;
  let lastSuspendedAction: ChatDomainAction | null = null;

  const applyAction = (action: ChatDomainAction): void => {
    const before = state;
    state = timeReducer(action.type, () => reduceChatDomainState(state, action));
    const stateChanged = !Object.is(before, state);
    if (
      stateChanged &&
      isChatPerformanceTelemetryEnabled() &&
      (action.type === 'conversations/set' ||
        action.type === 'messages/set' ||
        action.type === 'hydrate/partial')
    ) {
      sampleStoreMemory(state, action.type);
    }
    if (stateChanged) {
      auditLogDispatch(action, before, state);
    }
    if (!stateChanged) {
      return;
    }
    if (suspendNotify) {
      lastSuspendedAction = action;
      return;
    }
    subscriptions.notify(state, action);
  };

  const dispatch = (action: ChatDomainAction): void => {
    applyAction(action);
  };

  const dispatchBatch = (actions: readonly ChatDomainAction[]): void => {
    if (actions.length === 0) return;
    if (actions.length === 1) {
      dispatch(actions[0]!);
      return;
    }
    suspendNotify = true;
    lastSuspendedAction = null;
    try {
      for (const action of actions) {
        applyAction(action);
      }
    } finally {
      suspendNotify = false;
      if (lastSuspendedAction != null) {
        noteBatchCommit(actions.length);
        subscriptions.notify(state, lastSuspendedAction);
      }
      lastSuspendedAction = null;
    }
  };

  const store: ChatDomainStoreWithBatch = {
    version: 'F5.0',
    getState: () => state,
    dispatch,
    dispatchBatch,
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
