/**
 * Phase 10F / Sprint 1 — Source of Truth de visibility de inbox (enabled IDs).
 *
 * Chat e Floating devem ler o mesmo snapshot após refresh.
 * Critério de lista: `enabled_in_chat !== false` (NÃO exige connected).
 * Connected fica no picker/composer via `filterConnectedChatInstances`.
 */

import type { ChatInstance } from '@/services/chat';
import type { ChatReconcileReason } from '../reconcile/types';
import { ensureChatInstances, invalidateChatInstanceRegistry } from './registry';
import { filterEnabledChatInstanceIds } from './helpers';

export type InboxInstanceVisibilitySnapshot = {
  instances: readonly ChatInstance[];
  /** IDs enabled para loadInbox — ordem estável (sort). */
  enabledInstanceIds: readonly string[];
  loading: boolean;
  lastResolvedAt: number;
};

const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_INSTANCES: readonly ChatInstance[] = Object.freeze([]);

let snapshot: InboxInstanceVisibilitySnapshot = {
  instances: EMPTY_INSTANCES,
  enabledInstanceIds: EMPTY_IDS,
  loading: false,
  lastResolvedAt: 0,
};

let inFlight: Promise<InboxInstanceVisibilitySnapshot> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort();
}

function publish(
  instances: readonly ChatInstance[],
  partial?: Partial<Pick<InboxInstanceVisibilitySnapshot, 'loading'>>,
): InboxInstanceVisibilitySnapshot {
  snapshot = {
    instances: Object.freeze([...instances]),
    enabledInstanceIds: Object.freeze(sortIds(filterEnabledChatInstanceIds(instances))),
    loading: partial?.loading ?? false,
    lastResolvedAt: Date.now(),
  };
  notify();
  return snapshot;
}

export function getInboxInstanceVisibilitySnapshot(): InboxInstanceVisibilitySnapshot {
  return snapshot;
}

export function subscribeInboxInstanceVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reset logout / testes. */
export function resetInboxInstanceVisibility(): void {
  snapshot = {
    instances: EMPTY_INSTANCES,
    enabledInstanceIds: EMPTY_IDS,
    loading: false,
    lastResolvedAt: 0,
  };
  inFlight = null;
  notify();
}

/** @deprecated alias — prefer `resetInboxInstanceVisibility` */
export function resetInboxInstanceVisibilityForTests(): void {
  resetInboxInstanceVisibility();
}

/**
 * Resolve instances + enabled IDs canônicos para inbox.
 * Coalesces in-flight. `force` invalida registry e força ensure.
 */
export async function refreshInboxInstanceVisibility(options?: {
  force?: boolean;
  reason?: ChatReconcileReason;
}): Promise<InboxInstanceVisibilitySnapshot> {
  if (inFlight && !options?.force) {
    return inFlight;
  }

  const run = (async (): Promise<InboxInstanceVisibilitySnapshot> => {
    snapshot = { ...snapshot, loading: true };
    notify();
    try {
      if (options?.force) {
        invalidateChatInstanceRegistry('manual');
      }
      const instances = await ensureChatInstances({
        force: options?.force === true,
        reason: options?.reason ?? 'bootstrap',
      });
      return publish(instances, { loading: false });
    } catch (error) {
      snapshot = { ...snapshot, loading: false };
      notify();
      throw error;
    }
  })();

  inFlight = run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  return inFlight;
}

/**
 * Aplica lista já carregada ao snapshot compartilhado (ex.: após hydrate local).
 * Preferir `refreshInboxInstanceVisibility` quando possível.
 */
export function applyInboxInstanceVisibilityFromInstances(
  instances: readonly ChatInstance[],
): InboxInstanceVisibilitySnapshot {
  return publish(instances, { loading: false });
}
