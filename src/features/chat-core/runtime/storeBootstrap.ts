/**
 * F5.1 — runtime shadow: Bridge / window events → Chat Core → Domain Store.
 */

import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { chatRealtimeBridge } from '../realtime/bridge';
import { CHAT_WS_EVENTS_V2, CHAT_WS_EVENTS_LEGACY } from '../realtime/contracts';
import { normalizeSocketEventByName } from '../realtime/normalize';
import { syncStoreFromSocketEvent } from '../store/integration';
import { runSocketBatch } from '../store/storeBatch';
import { shouldUseChatDomainStore } from '../store/flags';
import { shouldUseSingleChatSocket } from '../realtime/bridge';
import { bootstrapChatCoreStoreShadow } from '../core/chatCore';
import type { ChatDomainEvent } from '../domain/types';

let wired = false;
let unsubscribeBridge: (() => void) | null = null;
const windowCleanups: Array<() => void> = [];

/** F6.5 — coalescing de bursts WS no mesmo tick. */
let pendingBridgeEvents: ChatDomainEvent[] = [];
let bridgeFlushScheduled = false;

function flushPendingBridgeEvents(): void {
  bridgeFlushScheduled = false;
  const events = pendingBridgeEvents;
  pendingBridgeEvents = [];
  if (events.length === 0) return;
  if (events.length === 1) {
    syncStoreFromSocketEvent(events[0]!);
    return;
  }
  runSocketBatch(() => {
    for (const event of events) {
      syncStoreFromSocketEvent(event);
    }
  });
}

function enqueueBridgeEvent(event: ChatDomainEvent): void {
  if (!shouldUseChatDomainStore()) return;
  pendingBridgeEvents.push(event);
  if (bridgeFlushScheduled) return;
  bridgeFlushScheduled = true;
  queueMicrotask(flushPendingBridgeEvents);
}

function onDomainEvent(eventName: string, payload: unknown): void {
  if (!shouldUseChatDomainStore()) return;
  const event = normalizeSocketEventByName(eventName, payload);
  enqueueBridgeEvent(event);
}

function attachWindowListener(eventName: string, handler: (e: Event) => void): void {
  window.addEventListener(eventName, handler);
  windowCleanups.push(() => window.removeEventListener(eventName, handler));
}

export function ensureChatCoreStoreRuntimeWired(): void {
  if (wired) return;
  wired = true;

  // F5.11 — ingresso único via Bridge quando F1 ON; window só quando F1 OFF (socket legado).
  // F6.5 — bursts no mesmo tick são coalesceados em um único notify.
  unsubscribeBridge = chatRealtimeBridge.subscribe((event) => {
    enqueueBridgeEvent(event);
  });

  if (!shouldUseSingleChatSocket()) {
    const windowHandlers: Array<[string, string]> = [
      [REALTIME_WINDOW_EVENTS.messageCreated, CHAT_WS_EVENTS_V2.messageCreated],
      [REALTIME_WINDOW_EVENTS.conversationUpdated, CHAT_WS_EVENTS_V2.conversationUpdated],
      [REALTIME_WINDOW_EVENTS.conversationDeleted, CHAT_WS_EVENTS_V2.conversationDeleted],
    ];

    for (const [windowName, socketName] of windowHandlers) {
      attachWindowListener(windowName, (e) => {
        onDomainEvent(socketName, (e as CustomEvent).detail);
      });
    }
  }

  attachWindowListener('online', () => {
    if (!shouldUseChatDomainStore()) return;
    void import('../store/integration').then(({ applyChatStoreReconnect }) => {
      applyChatStoreReconnect();
    });
  });
}

export function bootstrapChatCoreStoreSession(params?: {
  userId?: string | null;
  tenantId?: string | null;
  instanceIds?: string[];
  inboxScope?: 'owner' | 'tenant';
}): void {
  ensureChatCoreStoreRuntimeWired();
  if (!shouldUseChatDomainStore()) return;
  void bootstrapChatCoreStoreShadow({
    instanceIds: params?.instanceIds,
    inboxScope: params?.inboxScope,
    hydrateInbox: Boolean(params?.instanceIds?.length),
  });
}

export function teardownChatCoreStoreRuntimeForTests(): void {
  unsubscribeBridge?.();
  unsubscribeBridge = null;
  for (const cleanup of windowCleanups) cleanup();
  windowCleanups.length = 0;
  pendingBridgeEvents = [];
  bridgeFlushScheduled = false;
  wired = false;
}

/** @internal test hook */
export const CHAT_STORE_RUNTIME_EVENT_NAMES = {
  messageUpdated: CHAT_WS_EVENTS_LEGACY.messageUpdated,
  attendanceUpdated: CHAT_WS_EVENTS_V2.conversationAttendanceUpdated,
} as const;
