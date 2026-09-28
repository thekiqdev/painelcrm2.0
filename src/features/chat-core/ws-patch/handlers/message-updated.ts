/**
 * F2.3 — patch message.updated
 */

import type { QueryClient } from '@tanstack/react-query';
import { normalizeChatMessage, type ChatMessage } from '@/services/chat';
import type { ChatWsPatchResult } from '../types';
import { patchFloatingChatMessages, pickConversationId } from '../query-cache';
import { isMessageUpdatedPayloadSufficient } from '../payload-sufficiency';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function applyMessageUpdatedPatch(
  queryClient: QueryClient,
  raw: unknown,
): ChatWsPatchResult {
  if (!isMessageUpdatedPayloadSufficient(raw)) {
    return { applied: false, eventKind: 'message.updated', reason: 'payload_insufficient' };
  }

  const r = asRecord(raw);
  const conversationId =
    pickConversationId(r) ?? (typeof r.conversationId === 'string' ? r.conversationId : null);
  if (!conversationId) {
    return { applied: false, eventKind: 'message.updated', reason: 'missing_conversation_id' };
  }

  const messageRaw = asRecord(r.message ?? r);
  const normalized = normalizeChatMessage({
    ...messageRaw,
    conversation_id: conversationId,
  });

  const messagesKeyExists = Boolean(
    queryClient.getQueryCache().find({ queryKey: ['floating-chat', 'messages', conversationId] }),
  );
  if (!messagesKeyExists) {
    return { applied: false, eventKind: 'message.updated', reason: 'messages_not_cached' };
  }

  const patched = patchFloatingChatMessages(queryClient, conversationId, (prev) => {
    const idx = prev.findIndex(
      (m) =>
        (normalized.id && m.id === normalized.id) ||
        (!!normalized.external_message_id &&
          m.external_message_id === normalized.external_message_id),
    );
    if (idx < 0) return prev;
    const next = [...prev];
    next[idx] = { ...next[idx], ...normalized };
    return next;
  });

  return {
    applied: patched,
    eventKind: 'message.updated',
    scopes: patched ? ['messages'] : undefined,
    reason: patched ? undefined : 'message_not_in_cache',
  };
}
