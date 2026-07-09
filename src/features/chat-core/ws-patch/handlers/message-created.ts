/**
 * F2.1 — patch message.created
 */

import type { QueryClient } from '@tanstack/react-query';
import { coerceChatPlainText, normalizeChatMessage, normalizeConversation, type ChatConversation, type ChatMessage } from '@/services/chat';
import type { ChatWsPatchContext, ChatWsPatchResult } from '../types';
import {
  conversationExistsInFloatingCaches,
  patchAllFloatingConversationLists,
  patchFloatingChatConversationMeta,
  patchFloatingChatMessages,
  patchFloatingChatMinimizedMeta,
  pickConversationId,
} from '../query-cache';
import { isMessageCreatedPayloadSufficient, messageCreatedRawToLegacyShape } from '../payload-sufficiency';

function appendMessageDeduped(prev: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (message.id && prev.some((m) => m.id === message.id)) return prev;
  const ext = message.external_message_id;
  if (ext && prev.some((m) => m.external_message_id === ext)) return prev;
  return [...prev, message];
}

function buildPreviewFromMessage(message: ChatMessage): string {
  const c = message.message_contract;
  const previewText =
    coerceChatPlainText(c?.body) || coerceChatPlainText(message.body) || '';
  return (
    previewText ||
    (c?.kind === 'audio' ? '[Áudio]' : '') ||
    (c?.kind === 'document' ? '[Documento]' : '') ||
    (c?.kind === 'image' || (message.media && message.media.length > 0) ? '[Imagem]' : '') ||
    '[Mídia]'
  );
}

export function applyMessageCreatedPatch(
  queryClient: QueryClient,
  raw: unknown,
  ctx: ChatWsPatchContext = {},
): ChatWsPatchResult {
  if (!isMessageCreatedPayloadSufficient(raw)) {
    return { applied: false, eventKind: 'message.created', reason: 'payload_insufficient' };
  }

  const legacy = messageCreatedRawToLegacyShape(raw);
  if (!legacy) {
    return { applied: false, eventKind: 'message.created', reason: 'payload_shape' };
  }

  const normalizedMessage = normalizeChatMessage({
    ...legacy.message,
    conversation_id: legacy.conversationId,
  });

  const conversationId = legacy.conversationId;
  const scopes: string[] = [];
  let messagesPatched = false;
  let listsPatched = false;

  const messagesKeyExists = Boolean(
    queryClient.getQueryCache().find({ queryKey: ['floating-chat', 'messages', conversationId] }),
  );

  if (messagesKeyExists) {
    messagesPatched = patchFloatingChatMessages(queryClient, conversationId, (prev) =>
      appendMessageDeduped(prev, normalizedMessage),
    );
    if (messagesPatched) scopes.push('messages');
  }

  const inCache = conversationExistsInFloatingCaches(queryClient, conversationId);
  if (!inCache) {
    if (messagesPatched) {
      return {
        applied: true,
        eventKind: 'message.created',
        scopes,
        reason: 'lists_not_cached',
      };
    }
    return {
      applied: false,
      eventKind: 'message.created',
      reason: 'conversation_not_in_cache',
    };
  }

  const preview = buildPreviewFromMessage(normalizedMessage);
  const sentAt = normalizedMessage.sentAt ?? new Date().toISOString();
  const incomingPartial = normalizeConversation({
    id: conversationId,
    last_message_preview: preview,
    last_message_at: sentAt,
  });

  listsPatched = patchAllFloatingConversationLists(queryClient, conversationId, (prev) => {
    if (!prev) {
      return normalizeConversation({
        id: conversationId,
        last_message_preview: preview,
        last_message_at: sentAt,
        unread_count: ctx.isActiveConversation ? 0 : 1,
      });
    }
    const unread =
      ctx.isActiveConversation || normalizedMessage.direction !== 'incoming'
        ? prev.unreadCount
        : (prev.unreadCount || 0) + 1;
    return {
      ...prev,
      lastMessagePreview: preview,
      lastMessageAt: sentAt,
      unreadCount: unread,
      updated_at: sentAt,
    };
  });
  if (listsPatched) scopes.push('lists');

  if (patchFloatingChatConversationMeta(queryClient, conversationId, incomingPartial)) {
    scopes.push('meta');
  }
  if (ctx.isMinimizedConversation) {
    if (patchFloatingChatMinimizedMeta(queryClient, conversationId, incomingPartial)) {
      scopes.push('minimized-meta');
    }
  }

  const applied = messagesPatched || listsPatched;
  return {
    applied,
    eventKind: 'message.created',
    scopes,
    reason: applied ? undefined : 'no_cache_targets',
  };
}

/** Resolve conversationId de payload legacy new_message. */
export function resolveMessageCreatedConversationId(raw: unknown): string | null {
  const legacy = messageCreatedRawToLegacyShape(raw);
  if (legacy) return legacy.conversationId;
  return pickConversationId(raw);
}
