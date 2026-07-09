/**
 * F2.5 — patch conversation_attendance_updated
 *
 * Atualiza campos de atendimento na conversa em cache.
 * Contadores agregados (queue/mine/team/unread global) NÃO vêm no payload —
 * permanecem no fluxo legado (HTTP reconcile).
 */

import type { QueryClient } from '@tanstack/react-query';
import { normalizeConversation } from '@/services/chat';
import type { ChatWsPatchResult } from '../types';
import {
  conversationExistsInFloatingCaches,
  patchAllFloatingConversationLists,
  patchFloatingChatConversationMeta,
  patchFloatingChatMinimizedMeta,
} from '../query-cache';
import { isAttendanceUpdatedPayloadSufficient } from '../payload-sufficiency';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function applyAttendanceUpdatedPatch(
  queryClient: QueryClient,
  raw: unknown,
): ChatWsPatchResult {
  if (!isAttendanceUpdatedPayloadSufficient(raw)) {
    return {
      applied: false,
      eventKind: 'conversation.attendance_updated',
      reason: 'payload_insufficient',
    };
  }

  const conv = asRecord(asRecord(raw).conversation);
  const conversationId = typeof conv.id === 'string' ? conv.id : null;
  if (!conversationId) {
    return {
      applied: false,
      eventKind: 'conversation.attendance_updated',
      reason: 'missing_conversation_id',
    };
  }

  const incoming = normalizeConversation(conv);
  if (!conversationExistsInFloatingCaches(queryClient, conversationId)) {
    return {
      applied: false,
      eventKind: 'conversation.attendance_updated',
      reason: 'conversation_not_in_cache',
    };
  }

  const scopes: string[] = [];
  if (patchAllFloatingConversationLists(queryClient, conversationId, (prev) =>
    prev ? { ...prev, ...incoming } : null,
  )) {
    scopes.push('lists');
  }
  if (patchFloatingChatConversationMeta(queryClient, conversationId, incoming)) {
    scopes.push('meta');
  }
  if (patchFloatingChatMinimizedMeta(queryClient, conversationId, incoming)) {
    scopes.push('minimized-meta');
  }

  const applied = scopes.length > 0;
  return {
    applied,
    eventKind: 'conversation.attendance_updated',
    scopes,
    reason: applied ? undefined : 'no_cache_targets',
  };
}
