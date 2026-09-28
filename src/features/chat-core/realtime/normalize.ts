/**
 * Normalizadores de eventos WebSocket → ChatDomainEvent (F0).
 *
 * Puros e sem side-effects. Não são ligados aos listeners atuais —
 * Chat.tsx / realtimeClient continuam inalterados. F1+ poderá
 * reutilizar estas funções no Bridge.
 */

import type { ChatDomainEvent, ChatDomainEventKind } from '../domain/types';
import {
  CHAT_WS_EVENTS_LEGACY,
  CHAT_WS_EVENTS_V2,
  type ChatWsConversationDeletedPayload,
  type ChatWsConversationUpdatedPayload,
  type ChatWsMessageCreatedPayload,
} from './contracts';

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function pickConversationId(raw: Record<string, unknown>): string | undefined {
  const a = raw.conversation_id ?? raw.conversationId ?? raw.id;
  return typeof a === 'string' && a.length > 0 ? a : undefined;
}

function pickMessageId(message: unknown, raw: Record<string, unknown>): string | undefined {
  if (message && typeof message === 'object') {
    const id = (message as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  if (typeof raw.id === 'string' && raw.id.length > 0) return raw.id;
  return undefined;
}

function baseEvent(
  kind: ChatDomainEventKind,
  protocol: ChatDomainEvent['protocol'],
  payload: unknown,
  extras: Partial<ChatDomainEvent> = {},
): ChatDomainEvent {
  return {
    kind,
    protocol,
    receivedAt: Date.now(),
    payload,
    ...extras,
  };
}

/** Normaliza evento v2 `message.created` ou legacy `new_message`. */
export function normalizeMessageCreatedEvent(
  payload: unknown,
  protocol: 'v2' | 'legacy',
): ChatDomainEvent {
  const raw = asRecord(payload) as ChatWsMessageCreatedPayload & Record<string, unknown>;
  const message = raw.message ?? payload;
  const messageObj = asRecord(message);
  const conversationId =
    pickConversationId(raw) ??
    (typeof messageObj.conversation_id === 'string' ? messageObj.conversation_id : undefined);
  return baseEvent('message.created', protocol, payload, {
    conversationId,
    messageId: pickMessageId(message, raw),
  });
}

/** Normaliza `conversation.updated` / `conversation_updated`. */
export function normalizeConversationUpdatedEvent(
  payload: unknown,
  protocol: 'v2' | 'legacy',
): ChatDomainEvent {
  const raw = asRecord(payload) as ChatWsConversationUpdatedPayload;
  return baseEvent('conversation.updated', protocol, payload, {
    conversationId: pickConversationId(raw),
  });
}

/** Normaliza `conversation.deleted` / `conversation_deleted`. */
export function normalizeConversationDeletedEvent(
  payload: unknown,
  protocol: 'v2' | 'legacy',
): ChatDomainEvent {
  const raw = asRecord(payload) as ChatWsConversationDeletedPayload;
  return baseEvent('conversation.deleted', protocol, payload, {
    conversationId: pickConversationId(raw),
  });
}

/** Normaliza `message_updated`. */
export function normalizeMessageUpdatedEvent(payload: unknown): ChatDomainEvent {
  const raw = asRecord(payload);
  const message = raw.message ?? payload;
  return baseEvent('message.updated', 'normalized', payload, {
    conversationId: pickConversationId(raw),
    messageId: pickMessageId(message, raw),
  });
}

/** Normaliza `message.deleted`. */
export function normalizeMessageDeletedEvent(payload: unknown): ChatDomainEvent {
  const raw = asRecord(payload);
  const message = raw.message ?? payload;
  return baseEvent('message.deleted', 'normalized', payload, {
    conversationId: pickConversationId(raw),
    messageId: pickMessageId(message, raw),
  });
}

/** Normaliza eventos de status de entrega/leitura. */
export function normalizeMessageStatusEvent(
  payload: unknown,
  kind: Extract<
    ChatDomainEventKind,
    'message.read' | 'message.delivered' | 'message.failed'
  >,
  status: string,
): ChatDomainEvent {
  const raw = asRecord(payload);
  const message = raw.message ?? payload;
  const messageObj = asRecord(message);
  if (typeof messageObj.status !== 'string') {
    messageObj.status = status;
  }
  return baseEvent(kind, 'normalized', { ...raw, message: messageObj }, {
    conversationId: pickConversationId(raw),
    messageId: pickMessageId(message, raw),
  });
}

/** Normaliza `conversation_attendance_updated`. */
export function normalizeAttendanceUpdatedEvent(payload: unknown): ChatDomainEvent {
  const raw = asRecord(payload);
  const conversation = asRecord(raw.conversation);
  const conversationId =
    typeof conversation.id === 'string'
      ? conversation.id
      : pickConversationId(raw);
  return baseEvent('conversation.attendance_updated', 'normalized', payload, {
    conversationId,
  });
}

/** Normaliza `channel.status_changed`. */
export function normalizeChannelStatusChangedEvent(payload: unknown): ChatDomainEvent {
  const raw = asRecord(payload);
  const instanceId =
    typeof raw.instance_id === 'string'
      ? raw.instance_id
      : typeof raw.instanceId === 'string'
        ? raw.instanceId
        : undefined;
  return baseEvent('channel.status_changed', 'normalized', payload, { instanceId });
}

/** Normaliza `whatsapp.instance_removed`. */
export function normalizeWhatsappInstanceRemovedEvent(payload: unknown): ChatDomainEvent {
  const raw = asRecord(payload);
  const instanceId =
    typeof raw.instance_id === 'string'
      ? raw.instance_id
      : typeof raw.instanceId === 'string'
        ? raw.instanceId
        : undefined;
  return baseEvent('whatsapp.instance_removed', 'normalized', payload, { instanceId });
}

/**
 * Roteia pelo nome do evento socket → ChatDomainEvent.
 * Eventos desconhecidos → kind `unknown` (não lança).
 */
export function normalizeSocketEventByName(
  eventName: string,
  payload: unknown,
): ChatDomainEvent {
  switch (eventName) {
    case CHAT_WS_EVENTS_V2.messageCreated:
      return normalizeMessageCreatedEvent(payload, 'v2');
    case CHAT_WS_EVENTS_LEGACY.newMessage:
      return normalizeMessageCreatedEvent(payload, 'legacy');
    case CHAT_WS_EVENTS_V2.conversationUpdated:
      return normalizeConversationUpdatedEvent(payload, 'v2');
    case CHAT_WS_EVENTS_LEGACY.conversationUpdated:
      return normalizeConversationUpdatedEvent(payload, 'legacy');
    case CHAT_WS_EVENTS_V2.conversationDeleted:
      return normalizeConversationDeletedEvent(payload, 'v2');
    case CHAT_WS_EVENTS_LEGACY.conversationDeleted:
      return normalizeConversationDeletedEvent(payload, 'legacy');
    case CHAT_WS_EVENTS_V2.messageUpdated:
    case CHAT_WS_EVENTS_LEGACY.messageUpdated:
      return normalizeMessageUpdatedEvent(payload);
    case CHAT_WS_EVENTS_V2.conversationAttendanceUpdated:
      return normalizeAttendanceUpdatedEvent(payload);
    case CHAT_WS_EVENTS_V2.channelStatusChanged:
      return normalizeChannelStatusChangedEvent(payload);
    case CHAT_WS_EVENTS_V2.whatsappInstanceRemoved:
      return normalizeWhatsappInstanceRemovedEvent(payload);
    case CHAT_WS_EVENTS_V2.notificationCreated:
      return baseEvent('notification.created', 'v2', payload);
    case 'message.deleted':
      return normalizeMessageDeletedEvent(payload);
    case 'message.read':
      return normalizeMessageStatusEvent(payload, 'message.read', 'read');
    case 'message.delivered':
      return normalizeMessageStatusEvent(payload, 'message.delivered', 'delivered');
    case 'message.failed':
      return normalizeMessageStatusEvent(payload, 'message.failed', 'failed');
    default:
      return baseEvent('unknown', 'normalized', { eventName, payload });
  }
}
