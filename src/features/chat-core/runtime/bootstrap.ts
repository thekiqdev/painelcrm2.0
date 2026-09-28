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
  stopChatUnreadPeriodicReconcile,
} from '../unread-engine';
import { requestChatReconcile, subscribeChatReconcile } from '../reconcile';
import type { ChatReconcileReason, ChatReconcileScope } from '../reconcile';
import { bootstrapChatCoreStoreSession, ensureChatCoreStoreRuntimeWired } from './storeBootstrap';
import { recordPollingRemoved, recordSocketUpdate } from '../metrics/zeroPollingMetrics';

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
  recordSocketUpdate();
}

function onWindowConversationUpdated(e: Event): void {
  if (!shouldUseChatUnreadEngine()) return;
  applyChatUnreadFromConversationPayload((e as CustomEvent).detail);
  recordSocketUpdate();
}

/** Phase 9 — sem reconcile HTTP em online/focus (Socket entrega eventos). */

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
    // Instância removida = inconsistência real → reconcile pontual (não periódico).
    requestChatReconcile('all', 'inconsistency');
  });

  stopChatUnreadPeriodicReconcile();
  recordPollingRemoved(2); // periodic unread + (nav legacy poll retired at call sites)
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
