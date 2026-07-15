/**
 * F6.5 — Batch Dispatch Engine (agrupa actions WS em um único notify).
 * Não altera reducers; apenas o ritmo de commit/notify.
 */

import type { ChatDomainAction, ChatDomainStore } from './types';
import { getChatDomainStoreSession } from './session';
import { shouldUseChatDomainStore } from './flags';
import { recordBatchedDispatch } from '../metrics/renderOptimizationMetrics';

export type ChatDomainStoreWithBatch = ChatDomainStore & {
  dispatchBatch(actions: readonly ChatDomainAction[]): void;
};

export function isStoreWithBatch(store: ChatDomainStore): store is ChatDomainStoreWithBatch {
  return typeof (store as ChatDomainStoreWithBatch).dispatchBatch === 'function';
}

/** Despacha N actions com um único notify quando o store suporte batch. */
export function dispatchStoreActionsBatched(
  store: ChatDomainStore,
  actions: readonly ChatDomainAction[],
): void {
  if (actions.length === 0) return;
  if (actions.length === 1) {
    store.dispatch(actions[0]!);
    return;
  }
  if (isStoreWithBatch(store)) {
    store.dispatchBatch(actions);
    return;
  }
  for (const action of actions) {
    store.dispatch(action);
  }
}

type PendingBatch = {
  actions: ChatDomainAction[];
  flush: () => void;
};

let batchDepth = 0;
let microtaskQueued = false;
const pendingByStore = new WeakMap<object, PendingBatch>();

function getOrCreatePending(store: ChatDomainStore): PendingBatch {
  let pending = pendingByStore.get(store);
  if (!pending) {
    pending = {
      actions: [],
      flush: () => {
        const batch = pendingByStore.get(store);
        pendingByStore.delete(store);
        microtaskQueued = false;
        if (!batch || batch.actions.length === 0) return;
        dispatchStoreActionsBatched(store, batch.actions);
      },
    };
    pendingByStore.set(store, pending);
  }
  return pending;
}

/**
 * Enfileira actions. Com `batchDepth > 0` (runSocketBatch), adia o flush.
 * Fora de batch: flush imediato (compatível com asserts síncronos).
 */
export function enqueueSocketActions(
  store: ChatDomainStore,
  actions: readonly ChatDomainAction[],
): void {
  if (!shouldUseChatDomainStore() || actions.length === 0) return;

  const pending = getOrCreatePending(store);
  pending.actions.push(...actions);

  if (batchDepth > 0) {
    if (!microtaskQueued) {
      microtaskQueued = true;
      queueMicrotask(() => {
        // Só flush se ainda estamos (ou já saímos) e há pending —
        // runSocketBatch também dá flush no finally.
        const still = pendingByStore.get(store);
        if (still && batchDepth === 0) still.flush();
        else microtaskQueued = false;
      });
    }
    return;
  }

  pending.flush();
}

/**
 * Agrupa vários syncStoreFromSocketEvent num único notify.
 * Uso: burst de WS / testes F6.5.
 */
export function runSocketBatch(fn: () => void, store?: ChatDomainStore | null): void {
  const target = store ?? getChatDomainStoreSession();
  batchDepth += 1;
  try {
    fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && target) {
      flushSocketActionQueueForTests(target);
    }
  }
}

/** Aguarda flush do batch (testes async). */
export async function settleSocketActionQueue(
  store?: ChatDomainStore | null,
): Promise<void> {
  await Promise.resolve();
  flushSocketActionQueueForTests(store);
}

/** Flush imediato (testes). */
export function flushSocketActionQueueForTests(store?: ChatDomainStore | null): void {
  const target = store ?? getChatDomainStoreSession();
  if (!target) return;
  const pending = pendingByStore.get(target);
  if (pending) pending.flush();
}

export function resetSocketActionQueueForTests(): void {
  batchDepth = 0;
  microtaskQueued = false;
}

/** Marca telemetria de batch (chamado pelo createStore). */
export function noteBatchCommit(actionCount: number): void {
  recordBatchedDispatch(actionCount);
}
