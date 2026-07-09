/**
 * Dispatcher central WS Patch (F2).
 *
 * Substitui invalidateQueries quando flag da etapa está ON e payload é suficiente.
 * Fallback legado automático quando applied === false.
 */

import type { QueryClient } from '@tanstack/react-query';
import {
  CHAT_WS_EVENTS_LEGACY,
  CHAT_WS_EVENTS_V2,
} from '../realtime/contracts';
import { normalizeSocketEventByName } from '../realtime/normalize';
import {
  isChatWsPatchFlagEnabled,
  type ChatWsPatchFlag,
} from '../feature-flags';
import { recordChatRealtimeUpdate, recordChatWsPatchAttempt } from '../metrics/baseline';
import type { ChatWsPatchContext, ChatWsPatchResult } from './types';
import { applyMessageCreatedPatch } from './handlers/message-created';
import { applyConversationUpdatedPatch } from './handlers/conversation-updated';
import { applyMessageUpdatedPatch } from './handlers/message-updated';
import { applyConversationDeletedPatch } from './handlers/conversation-deleted';
import { applyAttendanceUpdatedPatch } from './handlers/attendance-updated';

const EVENT_FLAG: Record<string, ChatWsPatchFlag> = {
  [CHAT_WS_EVENTS_V2.messageCreated]: 'CHAT_WS_PATCH_MESSAGE',
  [CHAT_WS_EVENTS_LEGACY.newMessage]: 'CHAT_WS_PATCH_MESSAGE',
  [CHAT_WS_EVENTS_V2.conversationUpdated]: 'CHAT_WS_PATCH_CONVERSATION',
  [CHAT_WS_EVENTS_LEGACY.conversationUpdated]: 'CHAT_WS_PATCH_CONVERSATION',
  [CHAT_WS_EVENTS_V2.messageUpdated]: 'CHAT_WS_PATCH_MESSAGE_UPDATED',
  [CHAT_WS_EVENTS_LEGACY.messageUpdated]: 'CHAT_WS_PATCH_MESSAGE_UPDATED',
  [CHAT_WS_EVENTS_V2.conversationDeleted]: 'CHAT_WS_PATCH_DELETE',
  [CHAT_WS_EVENTS_LEGACY.conversationDeleted]: 'CHAT_WS_PATCH_DELETE',
  conversation_deleted: 'CHAT_WS_PATCH_DELETE',
  [CHAT_WS_EVENTS_V2.conversationAttendanceUpdated]: 'CHAT_WS_PATCH_ATTENDANCE',
  [CHAT_WS_EVENTS_LEGACY.conversationAttendanceUpdated]: 'CHAT_WS_PATCH_ATTENDANCE',
};

function flagForEvent(eventName: string): ChatWsPatchFlag | null {
  return EVENT_FLAG[eventName] ?? null;
}

function dispatchPatch(
  queryClient: QueryClient,
  eventName: string,
  raw: unknown,
  ctx: ChatWsPatchContext,
): ChatWsPatchResult {
  switch (eventName) {
    case CHAT_WS_EVENTS_V2.messageCreated:
    case CHAT_WS_EVENTS_LEGACY.newMessage:
      return applyMessageCreatedPatch(queryClient, raw, ctx);
    case CHAT_WS_EVENTS_V2.conversationUpdated:
    case CHAT_WS_EVENTS_LEGACY.conversationUpdated:
      return applyConversationUpdatedPatch(queryClient, raw, ctx);
    case CHAT_WS_EVENTS_V2.messageUpdated:
    case CHAT_WS_EVENTS_LEGACY.messageUpdated:
      return applyMessageUpdatedPatch(queryClient, raw);
    case CHAT_WS_EVENTS_V2.conversationDeleted:
    case CHAT_WS_EVENTS_LEGACY.conversationDeleted:
    case 'conversation_deleted':
      return applyConversationDeletedPatch(queryClient, raw);
    case CHAT_WS_EVENTS_V2.conversationAttendanceUpdated:
    case CHAT_WS_EVENTS_LEGACY.conversationAttendanceUpdated:
      return applyAttendanceUpdatedPatch(queryClient, raw);
    default:
      return { applied: false, eventKind: 'unknown', reason: 'unknown_event' };
  }
}

/**
 * Tenta aplicar patch WS no cache do Floating Chat.
 * Retorna `applied: false` → caller deve executar fluxo legado (invalidate/refetch).
 */
export function tryApplyChatWsPatch(
  queryClient: QueryClient,
  eventName: string,
  raw: unknown,
  ctx: ChatWsPatchContext = {},
): ChatWsPatchResult {
  const started = performance.now();
  const flag = flagForEvent(eventName);

  if (!flag) {
    const result: ChatWsPatchResult = {
      applied: false,
      eventKind: 'unknown',
      reason: 'no_flag_mapping',
    };
    recordChatWsPatchAttempt({
      eventName,
      eventKind: result.eventKind,
      applied: false,
      reason: result.reason,
      applyMs: 0,
    });
    return result;
  }

  if (!isChatWsPatchFlagEnabled(flag)) {
    const normalized = normalizeSocketEventByName(eventName, raw);
    const result: ChatWsPatchResult = {
      applied: false,
      eventKind: normalized.kind === 'unknown' ? 'unknown' : normalized.kind,
      reason: 'flag_off',
    };
    recordChatWsPatchAttempt({
      eventName,
      eventKind: result.eventKind,
      applied: false,
      reason: result.reason,
      applyMs: 0,
    });
    return result;
  }

  const result = dispatchPatch(queryClient, eventName, raw, ctx);
  const applyMs = Math.round(performance.now() - started);

  if (result.applied) {
    const normalized = normalizeSocketEventByName(eventName, raw);
    recordChatRealtimeUpdate({
      eventKind: normalized.kind,
      applyMs,
      source: `ws-patch:${flag}`,
    });
  }

  recordChatWsPatchAttempt({
    eventName,
    eventKind: result.eventKind,
    applied: result.applied,
    reason: result.reason,
    applyMs,
    scopes: result.scopes,
  });

  return result;
}

/** Snapshot das sub-flags F2 (diagnóstico). */
export function getChatWsPatchFlagsSnapshot(): Readonly<Record<ChatWsPatchFlag, boolean>> {
  return {
    CHAT_WS_PATCH_MESSAGE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_MESSAGE'),
    CHAT_WS_PATCH_CONVERSATION: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_CONVERSATION'),
    CHAT_WS_PATCH_MESSAGE_UPDATED: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_MESSAGE_UPDATED'),
    CHAT_WS_PATCH_DELETE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_DELETE'),
    CHAT_WS_PATCH_ATTENDANCE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_ATTENDANCE'),
  };
}

/** CHAT_WS_PATCH (fase) estável somente quando todas as sub-flags estão ligadas. */
export function isChatWsPatchPhaseComplete(): boolean {
  const snap = getChatWsPatchFlagsSnapshot();
  return Object.values(snap).every(Boolean);
}
