/**
 * F5.1 — aplica ChatDomainEvent ao Domain Store (shadow).
 */

import { adaptLegacyChatMessage } from '../domain/adapters';
import type { ChatDomainEvent } from '../domain/types';
import { chatDomainActionCreators } from './actions';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from './domainMappers';
import type { ChatDomainAction } from './types';

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

/** Tenant v2 lean: `conversation_id` sem row completa (`id` / external_chat_id / user_id). */
function isLeanConversationRealtimePayload(src: Record<string, unknown>): boolean {
  const conversationId =
    typeof src.conversation_id === 'string' && src.conversation_id.length > 0
      ? src.conversation_id
      : null;
  if (!conversationId) return false;
  const hasRowId = typeof src.id === 'string' && src.id.length > 0;
  if (hasRowId) return false;
  const hasUser = typeof src.user_id === 'string' && src.user_id.length > 0;
  const hasExternal =
    typeof src.external_chat_id === 'string' && src.external_chat_id.length > 0;
  return !hasUser && !hasExternal;
}

function resolveConversationPatchId(src: Record<string, unknown>, raw: Record<string, unknown>): string | null {
  const candidates = [src.id, src.conversation_id, raw.id, raw.conversation_id];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

function pickConversationPatch(payload: unknown) {
  const raw = asRecord(payload);
  const src = asRecord(raw.conversation ?? raw);
  const id = resolveConversationPatchId(src, raw);
  if (!id) return null;

  // TF3.1 — payload lean do tenant: só preview/at/unread (+ display_name); nunca inventar row magra.
  if (isLeanConversationRealtimePayload(src) || isLeanConversationRealtimePayload(raw)) {
    const lastMessageAt =
      typeof src.last_message_at === 'string'
        ? src.last_message_at
        : typeof src.lastMessageAt === 'string'
          ? src.lastMessageAt
          : src.last_message_at instanceof Date
            ? src.last_message_at.toISOString()
            : null;
    const lastMessagePreview =
      typeof src.last_message_preview === 'string'
        ? src.last_message_preview
        : typeof src.lastMessagePreview === 'string'
          ? src.lastMessagePreview
          : null;
    const unreadCount =
      typeof src.unread_count === 'number'
        ? src.unread_count
        : typeof src.unreadCount === 'number'
          ? src.unreadCount
          : undefined;
    const displayName =
      typeof src.display_name === 'string'
        ? src.display_name
        : typeof src.displayName === 'string'
          ? src.displayName
          : null;

    return {
      id,
      instanceId: null,
      channel: 'uazapi' as const,
      unreadCount: unreadCount ?? 0,
      lastMessageAt,
      lastMessagePreview,
      contactName: displayName,
      phoneNumber: null,
      attendanceStatus: null,
      assignedToUserId: null,
      clientId: null,
      leadId: null,
      conversationType: null,
      waArchived: typeof src.wa_archived === 'boolean' ? src.wa_archived : undefined,
      raw: {
        conversation_id: id,
        last_message_preview: lastMessagePreview,
        last_message_at: lastMessageAt,
        unread_count: unreadCount,
        display_name: displayName,
        __leanRealtimePatch: true,
      },
    };
  }

  try {
    // Phase 10B — uma normalização: mapLegacy já chama adapt/normalize.
    const mapped = mapLegacyConversationToDomain({
      ...(src as Parameters<typeof mapLegacyConversationToDomain>[0]),
      id,
    } as Parameters<typeof mapLegacyConversationToDomain>[0]);
    if (typeof mapped.id !== 'string' || !mapped.id) return null;
    return mapped;
  } catch {
    return {
      id,
      instanceId: null,
      channel: 'uazapi' as const,
      unreadCount: typeof src.unread_count === 'number' ? src.unread_count : 0,
      lastMessageAt:
        typeof src.last_message_at === 'string'
          ? src.last_message_at
          : typeof src.lastMessageAt === 'string'
            ? src.lastMessageAt
            : null,
      lastMessagePreview:
        typeof src.last_message_preview === 'string'
          ? src.last_message_preview
          : typeof src.lastMessagePreview === 'string'
            ? src.lastMessagePreview
            : null,
      contactName: null,
      phoneNumber: null,
      attendanceStatus: null,
      assignedToUserId: null,
      clientId: null,
      leadId: null,
      conversationType: null,
      raw: { ...src, id, __leanRealtimePatch: true },
    };
  }
}

/**
 * TF5 — flatten payload v2 (message_id / provider_message_id flat, sem nested `.message`)
 * so normalizeChatMessage / mapLegacyMessageToDomain receive stable ids + sent_at.
 */
function flattenMessagePayload(payload: unknown): Record<string, unknown> {
  const raw = asRecord(payload);
  const nested =
    raw.message && typeof raw.message === 'object' ? asRecord(raw.message) : null;
  const src = nested ?? raw;

  return {
    ...src,
    id: src.id ?? src.message_id ?? raw.message_id ?? raw.id,
    message_id: src.message_id ?? raw.message_id,
    conversation_id: src.conversation_id ?? raw.conversation_id,
    direction: src.direction ?? raw.direction,
    body: src.body ?? raw.body,
    status: src.status ?? raw.status,
    sent_at: src.sent_at ?? src.sentAt ?? raw.sent_at ?? raw.sentAt,
    sentAt: src.sentAt ?? src.sent_at ?? raw.sentAt ?? raw.sent_at,
    external_message_id:
      src.external_message_id ??
      src.provider_message_id ??
      raw.external_message_id ??
      raw.provider_message_id ??
      null,
    provider_message_id: src.provider_message_id ?? raw.provider_message_id ?? null,
    client_message_id: src.client_message_id ?? raw.client_message_id ?? null,
    media: src.media ?? raw.media,
    metadata: src.metadata ?? raw.metadata,
  };
}

function pickMessageFromPayload(payload: unknown) {
  const message = flattenMessagePayload(payload);
  try {
    return mapLegacyMessageToDomain(adaptLegacyChatMessage(message));
  } catch {
    return null;
  }
}

/** Converte evento WS normalizado em actions do store. */
export function mapDomainEventToActions(event: ChatDomainEvent): ChatDomainAction[] {
  switch (event.kind) {
    case 'message.created': {
      const message = pickMessageFromPayload(event.payload);
      if (!message) return [];
      return [chatDomainActionCreators.appendMessage(message.conversationId, message)];
    }
    case 'message.updated':
    case 'message.read':
    case 'message.delivered':
    case 'message.failed': {
      const message = pickMessageFromPayload(event.payload);
      if (!message) return [];
      const status =
        event.kind === 'message.read'
          ? 'read'
          : event.kind === 'message.delivered'
            ? 'delivered'
            : event.kind === 'message.failed'
              ? 'failed'
              : message.status;
      return [
        chatDomainActionCreators.updateMessage(message.conversationId, message.id, {
          ...message,
          status: status ?? message.status,
        }),
      ];
    }
    case 'message.deleted': {
      const message = pickMessageFromPayload(event.payload);
      const conversationId = message?.conversationId ?? event.conversationId;
      const messageId = message?.id ?? event.messageId;
      if (!conversationId || !messageId) return [];
      return [chatDomainActionCreators.removeMessage(conversationId, messageId)];
    }
    case 'conversation.updated':
    case 'conversation.attendance_updated': {
      const conversation = pickConversationPatch(event.payload);
      if (!conversation || typeof conversation.id !== 'string' || !conversation.id) return [];
      return [{ type: 'conversations/upsert' as const, conversation }];
    }
    case 'conversation.deleted': {
      const id = event.conversationId;
      if (!id) return [];
      return [{ type: 'conversations/remove' as const, conversationId: id }];
    }
    default:
      return [];
  }
}
