/**
 * Validação de suficiência de payload WS (F2).
 * Payload insuficiente → fallback legado automático.
 */

import { normalizeChatMessage } from '@/services/chat';
import { pickConversationId } from './query-cache';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function hasMessageId(message: Record<string, unknown>, raw: Record<string, unknown>): boolean {
  const id = message.id ?? raw.message_id ?? raw.provider_message_id ?? raw.id;
  return typeof id === 'string' && id.length > 0;
}

/** F2.1 — message.created / new_message */
export function isMessageCreatedPayloadSufficient(raw: unknown): boolean {
  const r = asRecord(raw);
  const conversationId = pickConversationId(r);
  if (!conversationId) return false;

  const message = asRecord(r.message ?? r);
  if (!hasMessageId(message, r)) return false;

  const direction = message.direction ?? r.direction;
  if (direction !== 'incoming' && direction !== 'outgoing') return false;

  return true;
}

/** F2.2 — conversation.updated / conversation_updated */
export function isConversationUpdatedPayloadSufficient(raw: unknown): boolean {
  const r = asRecord(raw);
  const conversationId = pickConversationId(r);
  if (!conversationId) return false;

  const hasPreview =
    typeof r.last_message_preview === 'string' ||
    typeof r.lastMessagePreview === 'string';
  const hasLastAt =
    r.last_message_at != null ||
    r.lastMessageAt != null ||
    r.effective_last_message_at != null;
  const hasUnread = typeof r.unread_count === 'number' || typeof r.unreadCount === 'number';
  const hasDisplay =
    typeof r.display_name === 'string' ||
    typeof r.displayName === 'string' ||
    typeof r.contact_name === 'string';

  return hasPreview || hasLastAt || hasUnread || hasDisplay;
}

/** F2.3 — message_updated */
export function isMessageUpdatedPayloadSufficient(raw: unknown): boolean {
  const r = asRecord(raw);
  const conversationId =
    pickConversationId(r) ??
    (typeof r.conversationId === 'string' ? r.conversationId : null);
  if (!conversationId) return false;

  const message = asRecord(r.message ?? r);
  if (!hasMessageId(message, r)) return false;

  try {
    normalizeChatMessage({ ...message, conversation_id: conversationId });
    return true;
  } catch {
    return false;
  }
}

/** F2.4 — conversation.deleted */
export function isConversationDeletedPayloadSufficient(raw: unknown): boolean {
  return pickConversationId(raw) !== null;
}

/** F2.5 — conversation_attendance_updated */
export function isAttendanceUpdatedPayloadSufficient(raw: unknown): boolean {
  const r = asRecord(raw);
  const conv = asRecord(r.conversation);
  if (typeof conv.id !== 'string' || conv.id.length === 0) return false;

  const hasAttendanceField =
    conv.attendance_status != null ||
    conv.assigned_to_user_id != null ||
    conv.assigned_team_id != null ||
    conv.queue_id != null ||
    conv.closed_at != null;

  return hasAttendanceField;
}

/** Converte payload v2 message.created → forma legível por normalizeChatMessage. */
export function messageCreatedRawToLegacyShape(raw: unknown): {
  conversationId: string;
  message: Record<string, unknown>;
} | null {
  const r = asRecord(raw);
  const conversationId = pickConversationId(r);
  if (!conversationId) return null;

  if (r.message && typeof r.message === 'object') {
    const m = asRecord(r.message);
    return {
      conversationId,
      message: { ...m, conversation_id: m.conversation_id ?? conversationId },
    };
  }

  if (typeof r.conversationId === 'string' && r.message && typeof r.message === 'object') {
    const m = asRecord(r.message);
    return {
      conversationId: r.conversationId,
      message: { ...m, conversation_id: m.conversation_id ?? r.conversationId },
    };
  }

  if (typeof r.message_id === 'string' || typeof r.provider_message_id === 'string') {
    const mediaUrl = typeof r.media_url === 'string' ? r.media_url : null;
    const messageType = typeof r.message_type === 'string' ? r.message_type : 'text';
    return {
      conversationId,
      message: {
        id: r.message_id ?? r.provider_message_id,
        conversation_id: conversationId,
        direction: r.direction,
        body: r.body ?? null,
        sent_at: r.sent_at ?? null,
        status: r.status ?? null,
        external_message_id: r.provider_message_id ?? null,
        media: mediaUrl ? [{ type: messageType, url: mediaUrl }] : [],
        reply_to_message_id: r.reply_to_message_id ?? null,
        reply_preview: r.reply_preview ?? null,
        reply_sender_name: r.reply_sender_name ?? null,
        reply_message_type: r.reply_message_type ?? null,
      },
    };
  }

  return null;
}

/** Converte payload v2 conversation.updated → normalizeConversation input. */
export function conversationUpdatedRawToLegacyShape(raw: unknown): Record<string, unknown> | null {
  const r = asRecord(raw);
  const id = pickConversationId(r);
  if (!id) return null;

  if (typeof r.id === 'string') return r;

  return {
    id,
    conversation_id: id,
    provider: r.provider,
    last_message_preview: r.last_message_preview ?? r.lastMessagePreview,
    last_message_at: r.last_message_at ?? r.lastMessageAt,
    unread_count: r.unread_count ?? r.unreadCount,
    status: r.status,
    assigned_to_user_id: r.assigned_user_id ?? r.assigned_to_user_id,
    assigned_team_id: r.assigned_team_id,
    display_name: r.display_name ?? r.displayName,
    avatar_url: r.avatar_url ?? r.avatarUrl,
    updated_at: r.updated_at,
  };
}
