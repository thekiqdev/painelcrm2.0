/**
 * Instance Registry (F3) — única origem de instâncias quando flag ON.
 */

import type { ChatInstance } from '@/services/chat';
import { chatService } from '@/services/chat';
import { shouldUseChatInstanceRegistry } from '../feature-flags';
import {
  recordChatHttpRequest,
  recordChatF3ListInstancesAccess,
  recordChatF3ReconcileAvoided,
  recordChatF3ReconcileExecuted,
} from '../metrics/baseline';
import { recordInstancesReconciled } from '../reconcile/coordinator';
import type { ChatReconcileReason } from '../reconcile/types';
import {
  filterConnectedChatInstances,
  filterEnabledChatInstanceIds,
} from './helpers';

/** Alinhado a CHAT_INSTANCES_STALE_MS em chatPrefetch. */
const INSTANCES_TTL_MS = 2 * 60_000;

type RegistrySnapshot = {
  instances: readonly ChatInstance[];
  loading: boolean;
  lastFetchedAt: number;
  sessionKey: string | null;
};

type RegistryState = {
  instances: ChatInstance[];
  loading: boolean;
  lastFetchedAt: number;
  sessionKey: string | null;
  inFlight: Promise<ChatInstance[]> | null;
};

const state: RegistryState = {
  instances: [],
  loading: false,
  lastFetchedAt: 0,
  sessionKey: null,
  inFlight: null,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    fn();
  }
}

export { shouldUseChatInstanceRegistry };

export function configureChatInstanceRegistrySession(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): void {
  const key = userId ? `${userId}:${tenantId ?? ''}` : null;
  if (key === state.sessionKey) return;
  state.sessionKey = key;
  state.lastFetchedAt = 0;
  if (!key) {
    state.instances = [];
  }
  notify();
}

export function getChatInstanceRegistrySnapshot(): RegistrySnapshot {
  return {
    instances: state.instances,
    loading: state.loading,
    lastFetchedAt: state.lastFetchedAt,
    sessionKey: state.sessionKey,
  };
}

export function subscribeChatInstanceRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateChatInstanceRegistry(_reason?: string): void {
  state.lastFetchedAt = 0;
  notify();
}

function isCacheFresh(): boolean {
  if (state.instances.length === 0) return false;
  return Date.now() - state.lastFetchedAt < INSTANCES_TTL_MS;
}

export async function reconcileChatInstances(
  reason: ChatReconcileReason,
): Promise<ChatInstance[]> {
  if (state.inFlight) {
    recordChatF3ReconcileAvoided({ scope: 'instances', reason: 'in_flight_dedupe' });
    return state.inFlight;
  }

  state.loading = true;
  notify();

  state.inFlight = (async () => {
    try {
      recordChatF3ReconcileExecuted({ scope: 'instances', reason });
      recordChatF3ListInstancesAccess({ avoided: false, reason });
      recordChatHttpRequest({
        endpoint: '/api/chat/instances',
        method: 'GET',
        source: `instance_registry:${reason}`,
      });
      const data = await chatService.listInstances();
      state.instances = data;
      state.lastFetchedAt = Date.now();
      recordInstancesReconciled(reason);
      return data;
    } finally {
      state.loading = false;
      state.inFlight = null;
      notify();
    }
  })();

  return state.inFlight;
}

/**
 * Garante lista de instâncias — registry (flag ON) ou HTTP direto (legado).
 */
export async function ensureChatInstances(options?: {
  force?: boolean;
  reason?: ChatReconcileReason;
}): Promise<ChatInstance[]> {
  if (!shouldUseChatInstanceRegistry()) {
    return chatService.listInstances();
  }

  const reason = options?.reason ?? 'bootstrap';
  if (!options?.force && isCacheFresh()) {
    recordChatF3ListInstancesAccess({ avoided: true, reason: 'registry_cache' });
    recordChatF3ReconcileAvoided({ scope: 'instances', reason: 'registry_cache' });
    return state.instances;
  }

  return reconcileChatInstances(reason);
}

export function getChatInstancesFromRegistry(): readonly ChatInstance[] {
  return state.instances;
}

export function getChatEnabledInstanceIdsFromRegistry(): string[] {
  return filterEnabledChatInstanceIds(state.instances);
}

export function getChatConnectedInstancesFromRegistry(): ChatInstance[] {
  return filterConnectedChatInstances(state.instances);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function applyChatInstanceChannelStatus(payload: unknown): void {
  if (!shouldUseChatInstanceRegistry()) return;
  const raw = asRecord(payload);
  const instanceId =
    typeof raw.instance_id === 'string'
      ? raw.instance_id
      : typeof raw.instanceId === 'string'
        ? raw.instanceId
        : typeof raw.channel_id === 'string'
          ? raw.channel_id
          : null;
  if (!instanceId) return;

  const idx = state.instances.findIndex((i) => i.id === instanceId);
  if (idx < 0) {
    invalidateChatInstanceRegistry('ws_unknown_instance');
    return;
  }

  const status = raw.status;
  if (typeof status !== 'string') return;

  const next = [...state.instances];
  next[idx] = { ...next[idx], status };
  state.instances = next;
  notify();
}

export function applyChatInstanceRemoved(payload: unknown): void {
  if (!shouldUseChatInstanceRegistry()) return;
  const raw = asRecord(payload);
  const instanceId =
    typeof raw.instance_id === 'string'
      ? raw.instance_id
      : typeof raw.instanceId === 'string'
        ? raw.instanceId
        : null;
  if (!instanceId) return;
  state.instances = state.instances.filter((i) => i.id !== instanceId);
  notify();
}

export function resetChatInstanceRegistry(): void {
  state.instances = [];
  state.loading = false;
  state.lastFetchedAt = 0;
  state.sessionKey = null;
  state.inFlight = null;
  notify();
}
