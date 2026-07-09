/**
 * Interfaces públicas do Chat Core (F0 — contratos somente).
 *
 * Implementações concretas chegam nas fases F1–F5. Em F0 os métodos
 * podem lançar `ChatCoreNotWiredError` ou ser no-ops seguros.
 */

import type {
  ChatAttendanceCounts,
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainEvent,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatInboxScope,
  ChatInstanceId,
  ChatMessageId,
} from './types';

export class ChatCoreNotWiredError extends Error {
  constructor(method: string) {
    super(
      `[ChatCore] "${method}" ainda não está ligado (F0). Ative a fase correspondente do Master Plan.`,
    );
    this.name = 'ChatCoreNotWiredError';
  }
}

/** Comandos que a UI poderá enviar ao Chat Core (F5+). */
export type ChatCoreCommandHandlers = {
  loadInbox(
    params: {
      instanceIds: ChatInstanceId[];
      inboxScope: ChatInboxScope;
      surface?: string;
      quickFilter?: 'all' | 'mine' | 'unread';
      attendanceFilter?: '' | 'mine' | 'queue' | 'team' | 'closed';
      channelOrigin?: 'all' | 'uazapi' | 'official';
      conversationFilter?: 'groups';
      includeOfficialWhenAll?: boolean;
      allowEmpty?: boolean;
    },
  ): Promise<ChatDomainConversation[]>;
  clearInbox(): void;
  sendMessage(
    conversationId: ChatConversationId,
    body: string,
    options?: { replyToMessageId?: string; clientMessageId?: string; optimisticId?: string },
  ): Promise<ChatDomainMessage>;
  markMessageRead(conversationId: ChatConversationId, messageId: ChatMessageId): Promise<void>;
  markConversationRead(conversationId: ChatConversationId): Promise<void>;
  assignConversation(
    conversationId: ChatConversationId,
    body: { assignedToUserId: string; reason?: string },
  ): Promise<void>;
  transferConversation(
    conversationId: ChatConversationId,
    body: { toUserId?: string; toTeamId?: string; reason?: string },
  ): Promise<void>;
  archiveConversation(conversationId: ChatConversationId): Promise<void>;
  closeConversation(conversationId: ChatConversationId): Promise<void>;
  reopenConversation(conversationId: ChatConversationId): Promise<void>;
  deleteConversation(conversationId: ChatConversationId): Promise<void>;
  pinConversation(conversationId: ChatConversationId): Promise<void>;
  unpinConversation(conversationId: ChatConversationId): Promise<void>;
  updateConversationStatus(conversationId: ChatConversationId, status: string): Promise<void>;
  loadMessages(conversationId: ChatConversationId): Promise<ChatDomainMessage[]>;
};

export type ChatCoreCommands = {
  loadInstances(): Promise<ChatDomainInstance[]>;
  loadInbox(params: {
    instanceIds: ChatInstanceId[];
    inboxScope: ChatInboxScope;
  }): Promise<ChatDomainConversation[]>;
  loadMessages(conversationId: ChatConversationId): Promise<ChatDomainMessage[]>;
  markRead(conversationId: ChatConversationId): Promise<void>;
  sendText(conversationId: ChatConversationId, body: string): Promise<ChatDomainMessage>;
  /** Sync explícito — não usar como reação a WS. */
  syncMessages(conversationId: ChatConversationId): Promise<void>;
  /** Reconcile de contadores (baixa frequência). */
  reconcileAttendanceCounts(params: {
    instanceIds: ChatInstanceId[];
    inboxScope: ChatInboxScope;
  }): Promise<ChatAttendanceCounts>;
};

/** Selectors de leitura (observers UI). */
export type ChatCoreSelectors = {
  getConversation(id: ChatConversationId): ChatDomainConversation | null;
  getMessages(conversationId: ChatConversationId): readonly ChatDomainMessage[];
  getInstances(): readonly ChatDomainInstance[];
  getAttendanceCounts(): ChatAttendanceCounts | null;
  getMessage(id: ChatMessageId): ChatDomainMessage | null;
};

/** Aplicação de eventos realtime (Bridge → Core). */
export type ChatCoreEventApplier = {
  applyEvent(event: ChatDomainEvent): void;
};

/** API pública agregada do Chat Core. */
export type ChatCorePublicApi = ChatCoreCommands &
  ChatCoreSelectors &
  ChatCoreEventApplier & {
    readonly isWired: boolean;
    readonly phase: 'F0' | 'F5.1' | 'F5.5' | 'F5.6' | 'F5.7' | 'F5.9' | 'F5.10';
    readonly commands: ChatCoreCommandHandlers;
  };
