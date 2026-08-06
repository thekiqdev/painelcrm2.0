/**
 * F2.5 — patch conversation_attendance_updated
 *
 * Atualiza só campos de atendimento/assignee na conversa em cache.
 * Contadores agregados (queue/mine/team/unread global) NÃO vêm no payload —
 * permanecem no fluxo legado (HTTP reconcile).
 *
 * Nunca espalhar `normalizeConversation` parcial: isso zera contactName/phone → "?".
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ChatAttendanceStatus, ChatConversation } from '@/services/chat';
import type { ChatWsPatchResult } from '../types';
import {
  conversationExistsInFloatingCaches,
  patchAllFloatingConversationLists,
  patchFloatingChatConversationMeta,
  patchFloatingChatMinimizedMeta,
} from '../query-cache';
import { isAttendanceUpdatedPayloadSufficient } from '../payload-sufficiency';
import { mergeAttendanceConversationPatch } from '../conversation-merge';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function attendancePatchFromPayload(conv: Record<string, unknown>) {
  return {
    attendance_status: (conv.attendance_status as ChatAttendanceStatus | null | undefined) ?? undefined,
    assigned_to_user_id: conv.assigned_to_user_id as string | null | undefined,
    assignee_email: conv.assignee_email as string | null | undefined,
    assignee_display: conv.assignee_display as string | null | undefined,
    assignee_avatar_url: conv.assignee_avatar_url as string | null | undefined,
    queue_id: conv.queue_id as string | null | undefined,
    assigned_at: conv.assigned_at as string | null | undefined,
    closed_at: conv.closed_at as string | null | undefined,
    last_assignment_reason: conv.last_assignment_reason as string | null | undefined,
    assigned_team_id: conv.assigned_team_id as string | null | undefined,
    assigned_team_name: conv.assigned_team_name as string | null | undefined,
  };
}

/**
 * Incoming mínimo para os helpers de meta (que re-aplicam mergeChatConversationRealtimePatch).
 * `last_assignment_reason` força o ramo de assignee; identidade fica preservada via `??`.
 */
function attendanceIncomingForMetaMerge(
  conversationId: string,
  patch: ReturnType<typeof attendancePatchFromPayload>,
): ChatConversation {
  return {
    id: conversationId,
    user_id: '',
    external_chat_id: '',
    unreadCount: 0,
    ...patch,
    last_assignment_reason: patch.last_assignment_reason ?? 'attendance_ws',
  };
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

  if (!conversationExistsInFloatingCaches(queryClient, conversationId)) {
    return {
      applied: false,
      eventKind: 'conversation.attendance_updated',
      reason: 'conversation_not_in_cache',
    };
  }

  const patch = attendancePatchFromPayload(conv);
  const scopes: string[] = [];

  if (
    patchAllFloatingConversationLists(queryClient, conversationId, (prev) => {
      if (!prev) return null;
      // Já mesclado; patchConversationRow no helper re-aplica merge seguro (identidade via ??).
      return mergeAttendanceConversationPatch(prev, patch);
    })
  ) {
    scopes.push('lists');
  }

  const metaIncoming = attendanceIncomingForMetaMerge(conversationId, patch);
  if (patchFloatingChatConversationMeta(queryClient, conversationId, metaIncoming)) {
    scopes.push('meta');
  }
  if (patchFloatingChatMinimizedMeta(queryClient, conversationId, metaIncoming)) {
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
