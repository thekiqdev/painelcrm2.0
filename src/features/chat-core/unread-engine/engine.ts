/**
 * Unread Engine (F3) — contadores incrementais; HTTP apenas via reconcile.
 */

import { chatService } from '@/services/chat';
import type { ChatAttendanceCounts, ChatInboxScope } from '../domain/types';
import { shouldUseChatAttendanceReconcile, shouldUseChatUnreadEngine } from '../feature-flags';
import {
  recordChatHttpRequest,
  recordChatF3AttendanceCountsAccess,
  recordChatF3ReconcileAvoided,
  recordChatF3ReconcileExecuted,
} from '../metrics/baseline';
import { recordAttendanceReconciled } from '../reconcile/coordinator';
import type { ChatReconcileReason } from '../reconcile/types';

const EMPTY_COUNTS: ChatAttendanceCounts = {
  queue: 0,
  mine: 0,
  team: 0,
  unassigned: 0,
  closed: 0,
  unread: 0,
};

/** Alinhado ao poll legado do nav unread. */
export const CHAT_UNREAD_RECONCILE_INTERVAL_MS = 120_000;
const ATTENDANCE_RECONCILE_DEBOUNCE_MS = 2_000;

type Scope = {
  instanceIds: string[];
  inboxScope: ChatInboxScope;
};

type EngineState = {
  counts: ChatAttendanceCounts | null;
  scope: Scope | null;
  conversationUnread: Map<string, number>;
  lastReconcileAt: number;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  periodicTimer: ReturnType<typeof setInterval> | null;
  reconcileInFlight: Promise<ChatAttendanceCounts> | null;
};

const state: EngineState = {
  counts: null,
  scope: null,
  conversationUnread: new Map(),
  lastReconcileAt: 0,
  reconcileTimer: null,
  periodicTimer: null,
  reconcileInFlight: null,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    fn();
  }
}

export { shouldUseChatUnreadEngine, shouldUseChatAttendanceReconcile } from '../feature-flags';

export function subscribeChatUnreadEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatUnreadEngineCounts(): ChatAttendanceCounts | null {
  return state.counts ? { ...state.counts } : null;
}

export function getChatGlobalUnreadCount(): number {
  return state.counts?.unread ?? 0;
}

export function setChatUnreadEngineScope(scope: Scope | null): void {
  if (
    scope &&
    state.scope &&
    scope.inboxScope === state.scope.inboxScope &&
    scope.instanceIds.join(',') === state.scope.instanceIds.join(',')
  ) {
    return;
  }
  state.scope = scope;
  if (!scope) {
    resetChatUnreadEngine();
  }
}

function scopeKey(scope: Scope): string {
  return `${scope.inboxScope}:${scope.instanceIds.slice().sort().join(',')}`;
}

export async function reconcileChatAttendanceCounts(
  reason: ChatReconcileReason,
  scopeOverride?: Scope,
): Promise<ChatAttendanceCounts> {
  const scope = scopeOverride ?? state.scope;
  if (!scope || scope.instanceIds.length === 0) {
    state.counts = { ...EMPTY_COUNTS };
    notify();
    return state.counts;
  }

  if (state.reconcileInFlight) {
    recordChatF3ReconcileAvoided({ scope: 'attendance', reason: 'in_flight_dedupe' });
    return state.reconcileInFlight;
  }

  state.reconcileInFlight = (async () => {
    try {
      recordChatF3ReconcileExecuted({ scope: 'attendance', reason });
      recordChatF3AttendanceCountsAccess({ avoided: false, reason });
      recordChatHttpRequest({
        endpoint: '/api/chat/conversations/attendance-counts',
        method: 'GET',
        source: `unread_engine:${reason}`,
      });
      const c = await chatService.getConversationAttendanceCounts({
        instanceIds: scope.instanceIds,
        inboxScope: scope.inboxScope,
      });
      state.counts = { ...c };
      state.scope = scope;
      state.lastReconcileAt = Date.now();
      recordAttendanceReconciled(reason);
      notify();
      return state.counts;
    } finally {
      state.reconcileInFlight = null;
    }
  })();

  return state.reconcileInFlight;
}

/**
 * Obtém contadores — engine (flag ON) com reconcile controlado ou HTTP legado.
 */
export async function fetchChatAttendanceCounts(
  params: { instanceIds: string[]; inboxScope?: ChatInboxScope },
  options?: { force?: boolean; reason?: ChatReconcileReason },
): Promise<ChatAttendanceCounts> {
  const inboxScope = params.inboxScope ?? 'owner';
  const scope: Scope = { instanceIds: params.instanceIds, inboxScope };

  if (!shouldUseChatUnreadEngine()) {
    recordChatHttpRequest({
      endpoint: '/api/chat/conversations/attendance-counts',
      method: 'GET',
      source: 'legacy_direct',
    });
    const c = await chatService.getConversationAttendanceCounts(params);
    return c;
  }

  setChatUnreadEngineScope(scope);
  const reason = options?.reason ?? 'bootstrap';

  if (options?.force || !state.counts || scopeKey(scope) !== scopeKey(state.scope!)) {
    if (shouldUseChatAttendanceReconcile() || options?.force || !state.counts) {
      return reconcileChatAttendanceCounts(reason, scope);
    }
  }

  if (state.counts) {
    recordChatF3AttendanceCountsAccess({ avoided: true, reason: 'engine_cache' });
    recordChatF3ReconcileAvoided({ scope: 'attendance', reason: 'engine_cache' });
    return { ...state.counts };
  }
  return reconcileChatAttendanceCounts(reason, scope);
}

function applyGlobalUnreadDelta(delta: number): void {
  if (!state.counts || delta === 0) return;
  state.counts = {
    ...state.counts,
    unread: Math.max(0, (state.counts.unread ?? 0) + delta),
  };
  notify();
}

export function applyChatUnreadFromConversationPayload(raw: unknown): void {
  if (!shouldUseChatUnreadEngine()) return;
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const conversationId =
    typeof r.conversation_id === 'string'
      ? r.conversation_id
      : typeof r.id === 'string'
        ? r.id
        : null;
  const unread =
    typeof r.unread_count === 'number'
      ? r.unread_count
      : typeof r.unreadCount === 'number'
        ? r.unreadCount
        : null;
  if (!conversationId || unread === null) return;

  if (!state.counts) {
    state.counts = { ...EMPTY_COUNTS, unread };
    state.conversationUnread.set(conversationId, unread);
    recordChatF3AttendanceCountsAccess({ avoided: true, reason: 'ws_unread_count' });
    notify();
    return;
  }

  const prev = state.conversationUnread.get(conversationId) ?? 0;
  if (prev === unread) return;
  state.conversationUnread.set(conversationId, unread);
  applyGlobalUnreadDelta(unread - prev);
  recordChatF3AttendanceCountsAccess({ avoided: true, reason: 'ws_unread_count' });
}

export function applyChatUnreadIncomingMessage(
  conversationId: string,
  isActiveConversation = false,
): void {
  if (!shouldUseChatUnreadEngine() || isActiveConversation) return;
  if (!state.counts) {
    state.counts = { ...EMPTY_COUNTS, unread: 1 };
  } else {
    applyGlobalUnreadDelta(1);
  }
  const prev = state.conversationUnread.get(conversationId) ?? 0;
  state.conversationUnread.set(conversationId, prev + 1);
  recordChatF3AttendanceCountsAccess({ avoided: true, reason: 'ws_incremental' });
  notify();
}

export function scheduleChatAttendanceReconcile(reason: ChatReconcileReason): void {
  if (!shouldUseChatUnreadEngine() || !shouldUseChatAttendanceReconcile()) return;
  if (state.reconcileTimer) {
    recordChatF3ReconcileAvoided({ scope: 'attendance', reason: 'debounce' });
  }
  if (state.reconcileTimer) clearTimeout(state.reconcileTimer);
  state.reconcileTimer = setTimeout(() => {
    state.reconcileTimer = null;
    void reconcileChatAttendanceCounts(reason);
  }, ATTENDANCE_RECONCILE_DEBOUNCE_MS);
}

export function startChatUnreadPeriodicReconcile(): void {
  if (!shouldUseChatUnreadEngine() || !shouldUseChatAttendanceReconcile()) return;
  if (state.periodicTimer) return;
  state.periodicTimer = setInterval(() => {
    void reconcileChatAttendanceCounts('cache_expired');
  }, CHAT_UNREAD_RECONCILE_INTERVAL_MS);
}

export function stopChatUnreadPeriodicReconcile(): void {
  if (state.periodicTimer) {
    clearInterval(state.periodicTimer);
    state.periodicTimer = null;
  }
  if (state.reconcileTimer) {
    clearTimeout(state.reconcileTimer);
    state.reconcileTimer = null;
  }
}

export function resetChatUnreadEngine(): void {
  stopChatUnreadPeriodicReconcile();
  state.counts = null;
  state.scope = null;
  state.conversationUnread.clear();
  state.lastReconcileAt = 0;
  notify();
}
