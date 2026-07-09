/**
 * Contratos oficiais dos eventos WebSocket do Chat (F0).
 *
 * Espelha nomes reais emitidos pelo backend / consumidos hoje em
 * `realtimeClient` e `Chat.tsx`. Não altera listeners existentes.
 */

/** Eventos v2 (salas tenant) — preferidos. */
export const CHAT_WS_EVENTS_V2 = {
  messageCreated: 'message.created',
  messageUpdated: 'message_updated',
  conversationUpdated: 'conversation.updated',
  conversationDeleted: 'conversation.deleted',
  conversationAttendanceUpdated: 'conversation_attendance_updated',
  notificationCreated: 'notification.created',
  channelStatusChanged: 'channel.status_changed',
  whatsappInstanceRemoved: 'whatsapp.instance_removed',
  messageCommentCreated: 'chat.message_comment.created',
  crmNoteCreated: 'crm.note.created',
} as const;

/** Eventos legacy (salas user) — fallback. */
export const CHAT_WS_EVENTS_LEGACY = {
  newMessage: 'new_message',
  conversationUpdated: 'conversation_updated',
  conversationDeleted: 'conversation_deleted',
  messageUpdated: 'message_updated',
  conversationAttendanceUpdated: 'conversation_attendance_updated',
} as const;

export type ChatWsEventNameV2 = (typeof CHAT_WS_EVENTS_V2)[keyof typeof CHAT_WS_EVENTS_V2];
export type ChatWsEventNameLegacy =
  (typeof CHAT_WS_EVENTS_LEGACY)[keyof typeof CHAT_WS_EVENTS_LEGACY];

/** Payload mínimo esperado — contratos documentais (validação estrita nas fases F1+). */
export type ChatWsMessageCreatedPayload = {
  conversation_id?: string;
  conversationId?: string;
  message?: unknown;
  id?: string;
  direction?: string;
};

export type ChatWsConversationUpdatedPayload = {
  id?: string;
  conversation_id?: string;
  conversationId?: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  [key: string]: unknown;
};

export type ChatWsConversationDeletedPayload = {
  id?: string;
  conversation_id?: string;
  conversationId?: string;
};

export type ChatWsAttendanceUpdatedPayload = {
  conversation?: Record<string, unknown>;
};

export type ChatWsChannelStatusPayload = {
  instance_id?: string;
  instanceId?: string;
  status?: string;
  [key: string]: unknown;
};
