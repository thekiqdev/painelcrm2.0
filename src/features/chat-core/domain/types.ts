/**
 * Contratos de domínio do Chat Core (F0).
 *
 * Modelos estáveis para a camada de domínio. Tipos atuais de UI
 * (`ChatConversation`, `ChatMessage` em `@/services/chat`) permanecem
 * a fonte de runtime até a F5; aqui definimos o contrato-alvo.
 */

/** Identificadores opacos usados em todo o Chat Core. */
export type ChatConversationId = string;
export type ChatMessageId = string;
export type ChatInstanceId = string;
export type ChatTenantId = string;
export type ChatUserId = string;

export type ChatChannelKind = 'uazapi' | 'whatsapp_official' | 'unknown' | string;

export type ChatMessageDirection = 'incoming' | 'outgoing';

export type ChatInboxScope = 'tenant' | 'owner';

/** Snapshot canônico de conversa (domínio). */
export type ChatDomainConversation = {
  id: ChatConversationId;
  instanceId: ChatInstanceId | null;
  channel: ChatChannelKind;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contactName: string | null;
  phoneNumber: string | null;
  attendanceStatus: string | null;
  /** WhatsApp archive (CRM-owned); not CRM attendance. */
  waArchived?: boolean;
  assignedToUserId: string | null;
  clientId: string | null;
  leadId: string | null;
  conversationType: string | null;
  /** Payload bruto / campos extras preservados para compatibilidade durante a migração. */
  raw?: unknown;
};

/** Snapshot canônico de mensagem (domínio). */
export type ChatDomainMessage = {
  id: ChatMessageId;
  conversationId: ChatConversationId;
  direction: ChatMessageDirection;
  body: string | null;
  status: string | null;
  sentAt: string | null;
  externalMessageId: string | null;
  clientMessageId: string | null;
  raw?: unknown;
};

/** Snapshot canônico de instância / conta de canal. */
export type ChatDomainInstance = {
  id: ChatInstanceId;
  status: string | null;
  enabledInChat: boolean;
  channel: ChatChannelKind;
  raw?: unknown;
};

/** Contadores de attendance / unread (Unread Engine). */
export type ChatAttendanceCounts = {
  queue: number;
  mine: number;
  team: number;
  unassigned: number;
  closed: number;
  /** WhatsApp-archived conversations (CRM-owned wa_archived). */
  wa_archived: number;
  unread: number;
};

/** Envelope de evento de domínio pós-normalização (Bridge → applyEvent). */
export type ChatDomainEventKind =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'message.read'
  | 'message.delivered'
  | 'message.failed'
  | 'conversation.updated'
  | 'conversation.deleted'
  | 'conversation.attendance_updated'
  | 'channel.status_changed'
  | 'whatsapp.instance_removed'
  | 'notification.created'
  | 'unknown';

export type ChatDomainEvent = {
  kind: ChatDomainEventKind;
  /** Protocolo de origem: v2 (tenant) ou legacy (user room). */
  protocol: 'v2' | 'legacy' | 'normalized';
  receivedAt: number;
  conversationId?: ChatConversationId;
  messageId?: ChatMessageId;
  instanceId?: ChatInstanceId;
  /** Payload já tipado quando possível; caso contrário unknown. */
  payload: unknown;
};
