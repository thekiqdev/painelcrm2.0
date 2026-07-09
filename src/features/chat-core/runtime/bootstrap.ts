/**
 * Bootstrap runtime F3 — listeners WS + reconcile inteligente.
 */

import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import {
  applyChatInstanceChannelStatus,
  applyChatInstanceRemoved,
  configureChatInstanceRegistrySession,
  invalidateChatInstanceRegistry,
  reconcileChatInstances,
} from '../instance-registry';
import { shouldUseChatInstanceRegistry } from '../feature-flags';
import {
  applyChatUnreadFromConversationPayload,
  applyChatUnreadIncomingMessage,
  reconcileChatAttendanceCounts,
  shouldUseChatAttendanceReconcile,
  shouldUseChatUnreadEngine,
  startChatUnreadPeriodicReconcile,
  stopChatUnreadPeriodicReconcile,
} from '../unread-engine';
import { requestChatReconcile, subscribeChatReconcile } from '../reconcile';
import type { ChatReconcileReason, ChatReconcileScope } from '../reconcile';
import { bootstrapChatCoreStoreSession, ensureChatCoreStoreRuntimeWired } from './storeBootstrap';

let wired = false;
let unsubscribeReconcile: (() => void) | null = null;

function onReconcileRequested(scope: ChatReconcileScope, reason: ChatReconcileReason): void {
  if (scope === 'instances' || scope === 'all') {
    if (shouldUseChatInstanceRegistry()) {
      void reconcileChatInstances(reason);
    }
  }
  if (scope === 'attendance' || scope === 'all') {
    if (shouldUseChatUnreadEngine() && shouldUseChatAttendanceReconcile()) {
      void reconcileChatAttendanceCounts(reason);
    }
  }
}

function onWindowMessageCreated(e: Event): void {
  if (!shouldUseChatUnreadEngine()) return;
  const d = (e as CustomEvent<Record<string, unknown>>).detail;
  const cid = (d?.conversation_id as string) || (d?.conversationId as string);
  if (typeof cid !== 'string') return;
  const dir = d?.direction as string | undefined;
  if (dir && dir !== 'incoming') return;
  applyChatUnreadIncomingMessage(cid, false);
}

function onWindowConversationUpdated(e: Event): void {
  if (!shouldUseChatUnreadEngine()) return;
  applyChatUnreadFromConversationPayload((e as CustomEvent).detail);
}

function onOnline(): void {
  requestChatReconcile('all', 'network_online');
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    requestChatReconcile('all', 'tab_visible');
  }
}

/** Instala listeners globais uma única vez. Sem efeito funcional com flags OFF. */
export function ensureChatF3RuntimeWired(): void {
  if (wired) return;
  wired = true;

  unsubscribeReconcile = subscribeChatReconcile(onReconcileRequested);

  window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onWindowMessageCreated);
  window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onWindowConversationUpdated);
  window.addEventListener(REALTIME_WINDOW_EVENTS.channelStatusChanged, (e) => {
    applyChatInstanceChannelStatus((e as CustomEvent).detail);
  });
  window.addEventListener(REALTIME_WINDOW_EVENTS.whatsappInstanceRemoved, (e) => {
    applyChatInstanceRemoved((e as CustomEvent).detail);
    invalidateChatInstanceRegistry('instance_removed');
    requestChatReconcile('all', 'inconsistency');
  });
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibilityChange);

  if (shouldUseChatUnreadEngine() && shouldUseChatAttendanceReconcile()) {
    startChatUnreadPeriodicReconcile();
  }
}

export function bootstrapChatF3Session(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): void {
  ensureChatF3RuntimeWired();
  ensureChatCoreStoreRuntimeWired();
  configureChatInstanceRegistrySession(userId, tenantId);
  if (userId) {
    requestChatReconcile('all', 'login');
  }
  bootstrapChatCoreStoreSession({ userId, tenantId });
}
