/**
 * F5.1 — orquestração shadow Repository / WS / Commands → Domain Store.
 */

import type { ChatDomainEvent, ChatInboxScope, ChatInstanceId } from '../domain/types';
import { delegatingChatRepository } from '../repository/delegatingChatRepository';
import { mapDomainEventToActions } from './eventAppliers';
import {
  mapRepositoryResponseToActions,
  type RepositorySyncSource,
} from './repositorySync';
import { recordStoreEventApplied, recordStoreHydrationMs, recordStoreSyncMs } from './metrics';
import { recordSocketLatency } from './consolidatedMetrics';
import { recordFloatingSocketApplyLatency } from './floatingMessageMetrics';
import { getChatDomainStoreSession, resetChatDomainStoreSession } from './session';
import { shouldUseChatDomainStore } from './flags';
import { loadInboxCommand } from '../core/loadInbox';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function dispatchRepositorySync(source: RepositorySyncSource, payload: unknown): void {
  const store = getChatDomainStoreSession();
  if (!store) return;
  const t0 = nowMs();
  for (const action of mapRepositoryResponseToActions(source, payload)) {
    store.dispatch(action);
  }
  recordStoreSyncMs(Math.max(0, Math.round(nowMs() - t0)));
  recordStoreEventApplied('repository');
}

export function syncStoreFromRepositoryResponse(source: RepositorySyncSource, payload: unknown): void {
  if (!shouldUseChatDomainStore()) return;
  dispatchRepositorySync(source, payload);
}

export function syncStoreFromSocketEvent(event: ChatDomainEvent): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  const t0 = nowMs();
  for (const action of mapDomainEventToActions(event)) {
    store.dispatch(action);
  }
  const durationMs = Math.max(0, Math.round(nowMs() - t0));
  recordStoreSyncMs(durationMs);
  recordSocketLatency(durationMs);
  recordStoreEventApplied('realtime');
  if (event.kind.startsWith('message.')) {
    recordFloatingSocketApplyLatency(durationMs);
  }
}

export function syncStoreFromCommandResult(command: string, payload: unknown): void {
  if (!shouldUseChatDomainStore()) return;
  if (command === 'listConversations') {
    if (import.meta.env.DEV) {
      console.warn(
        '[ChatCore F5.9] syncStoreFromCommandResult(listConversations) está obsoleto — use loadInboxCommand.',
      );
    }
    return;
  }
  const store = getChatDomainStoreSession();
  if (!store) return;
  const conversationCommands = new Set([
    'assignConversation',
    'transferConversation',
    'closeConversation',
    'archiveConversation',
    'reopenConversation',
    'updateConversationStatus',
    'pinConversation',
    'unpinConversation',
  ]);
  let source: RepositorySyncSource =
    command === 'sendMessage' || command === 'sendText'
      ? 'sendText'
      : command === 'markAsRead' || command === 'markRead' || command === 'markConversationRead'
        ? 'markRead'
        : command === 'listConversations'
          ? 'listConversations'
          : command === 'listMessages' || command === 'getMessages'
            ? 'listMessages'
            : command === 'getConversation' || conversationCommands.has(command)
              ? 'getConversation'
              : command === 'deleteConversation'
                ? 'getConversation'
                : 'unknown';
  let syncPayload = payload;
  if (conversationCommands.has(command) && payload && typeof payload === 'object' && 'conversation' in payload) {
    syncPayload = (payload as { conversation: unknown }).conversation;
  }
  if (command === 'deleteConversation') {
    const conversationId =
      payload && typeof payload === 'object' && 'conversation_id' in payload
        ? String((payload as { conversation_id: string }).conversation_id)
        : payload && typeof payload === 'object' && 'conversationId' in payload
          ? String((payload as { conversationId: string }).conversationId)
          : null;
    if (conversationId) {
      store.dispatch({ type: 'conversations/remove', conversationId });
      recordStoreEventApplied('command');
      return;
    }
  }
  dispatchRepositorySync(source, syncPayload);
  recordStoreEventApplied('command');
}

export type ChatStoreBootstrapParams = {
  instanceIds?: ChatInstanceId[];
  inboxScope?: ChatInboxScope;
  hydrateInbox?: boolean;
};

export async function applyChatStoreBootstrap(params: ChatStoreBootstrapParams = {}): Promise<void> {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;

  const t0 = nowMs();
  store.dispatch({
    type: 'connection/set',
    connection: { status: 'connected', lastConnectedAt: Date.now() },
  });

  try {
    const instances = await delegatingChatRepository.listInstances();
    syncStoreFromRepositoryResponse('listInstances', instances);

    if (params.hydrateInbox && params.instanceIds?.length) {
      await loadInboxCommand({
        instanceIds: params.instanceIds,
        inboxScope: params.inboxScope ?? 'tenant',
        surface: 'bootstrap',
        quickFilter: 'all',
      });
      store.dispatch({
        type: 'hydrate/partial',
        state: {
          conversations: {
            inboxScope: params.inboxScope ?? 'tenant',
            instanceIds: params.instanceIds,
            lastHydratedAt: Date.now(),
          },
        },
      });
    }
  } finally {
    recordStoreHydrationMs(Math.max(0, Math.round(nowMs() - t0)));
  }
}

export function applyChatStoreReset(): void {
  if (!shouldUseChatDomainStore()) return;
  resetChatDomainStoreSession();
}

export function applyChatStoreReconnect(): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  store.dispatch({
    type: 'connection/set',
    connection: { status: 'reconnecting', lastDisconnectedAt: Date.now() },
  });
  recordStoreEventApplied('realtime');
}
