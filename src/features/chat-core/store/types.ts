/**
 * F5.0 — contratos de estado do Domain Store.
 * Somente tipos; sem lógica de negócio.
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
} from '../domain/types';
import type { CommandSliceState } from './commandState';
import type { MessagePageId, MessagePageRecord } from './windowCacheTypes';
import type { ConversationVirtualizationState } from './conversationVirtualizationState';
import type { MessageVirtualizationState } from './messageVirtualizationState';

/** Estado raiz do Domain Store. */
export type ChatDomainState = {
  conversations: ConversationState;
  messages: MessageState;
  selection: SelectionState;
  compose: ComposeState;
  loading: LoadingState;
  unread: UnreadState;
  connection: ConnectionState;
  instances: InstanceState;
  ui: UIState;
  commands: CommandSliceState;
  /** F6.3 — janela virtual da sidebar de conversas. */
  conversationVirtualization: ConversationVirtualizationState;
  /** F6.4 — janela virtual da thread de mensagens. */
  messageVirtualization: MessageVirtualizationState;
};

export type ConversationState = {
  byId: Record<ChatConversationId, ChatDomainConversation>;
  orderedIds: ChatConversationId[];
  inboxScope: ChatInboxScope | null;
  instanceIds: ChatInstanceId[];
  lastHydratedAt: number | null;
};

export type MessageState = {
  /** Mensagens indexadas por id. */
  byId: Record<ChatMessageId, ChatDomainMessage>;
  /** Ordem de mensagens por conversa (conversationMessageIds). */
  byConversationId: Record<ChatConversationId, ChatMessageId[]>;
  /** Versão incremental por conversa (invalidação de render). */
  versionByConversationId: Record<ChatConversationId, number>;
  /**
   * @deprecated F6.0 — preferir `nextCursorByConversationId`.
   * Mantido para compatibilidade F5 (`selectHasMoreMessages`).
   */
  lastLoadedCursorByConversationId: Record<ChatConversationId, string | null>;
  /** Cursor ativo de load-more (alias operacional de nextCursor). */
  cursorByConversationId: Record<ChatConversationId, string | null>;
  hasMoreByConversationId: Record<ChatConversationId, boolean>;
  loadingMoreByConversationId: Record<ChatConversationId, boolean>;
  nextCursorByConversationId: Record<ChatConversationId, string | null>;
  previousCursorByConversationId: Record<ChatConversationId, string | null>;
  loadedPagesByConversationId: Record<ChatConversationId, number>;
  /** F6.2 — Sliding Window Cache */
  residentPagesByConversationId: Record<ChatConversationId, MessagePageId[]>;
  windowStartByConversationId: Record<ChatConversationId, number>;
  windowEndByConversationId: Record<ChatConversationId, number>;
  cachedPagesByConversationId: Record<
    ChatConversationId,
    Record<MessagePageId, MessagePageRecord>
  >;
  evictedPagesByConversationId: Record<ChatConversationId, MessagePageId[]>;
  memoryFootprintByConversationId: Record<ChatConversationId, number>;
};

export type SelectionState = {
  selectedConversationId: ChatConversationId | null;
  selectedInstanceIds: ChatInstanceId[];
};

export type ComposeState = {
  draftByConversationId: Record<ChatConversationId, string>;
};

export type LoadingState = {
  conversations: boolean;
  messages: Record<ChatConversationId, boolean>;
  instances: boolean;
  sending: Record<ChatConversationId, boolean>;
};

export type UnreadState = {
  global: number;
  byConversationId: Record<ChatConversationId, number>;
  attendance: ChatAttendanceCounts | null;
  lastReconciledAt: number | null;
};

export type ConnectionState = {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
};

export type InstanceState = {
  byId: Record<ChatInstanceId, ChatDomainInstance>;
  orderedIds: ChatInstanceId[];
  enabledIds: ChatInstanceId[];
};

export type UIState = {
  inboxFilter: string | null;
  searchTerm: string | null;
  channelOrigin: 'all' | 'uazapi' | 'official' | null;
  conversationFilter: 'all' | 'groups' | null;
};

/** Ações tipadas do store (contratos F5.0). */
export type ChatDomainAction =
  | { type: 'conversations/set'; conversations: ChatDomainConversation[] }
  | { type: 'conversations/upsert'; conversation: ChatDomainConversation }
  | { type: 'conversations/remove'; conversationId: ChatConversationId }
  | { type: 'messages/set'; conversationId: ChatConversationId; messages: ChatDomainMessage[] }
  | { type: 'messages/append'; conversationId: ChatConversationId; message: ChatDomainMessage }
  | {
      type: 'messages/update';
      conversationId: ChatConversationId;
      messageId: ChatMessageId;
      patch: Partial<ChatDomainMessage>;
    }
  | { type: 'messages/remove'; conversationId: ChatConversationId; messageId: ChatMessageId }
  | { type: 'messages/prepend'; conversationId: ChatConversationId; messages: ChatDomainMessage[] }
  | {
      type: 'messages/prependPage';
      conversationId: ChatConversationId;
      messages: ChatDomainMessage[];
      nextCursor?: string | null;
      previousCursor?: string | null;
      hasMore?: boolean;
    }
  | {
      type: 'messages/setCursor';
      conversationId: ChatConversationId;
      /** @deprecated F5 — use nextCursor */
      cursor?: string | null;
      nextCursor?: string | null;
      previousCursor?: string | null;
      hasMore?: boolean;
    }
  | {
      type: 'messages/setHasMore';
      conversationId: ChatConversationId;
      hasMore: boolean;
    }
  | {
      type: 'messages/setLoadingMore';
      conversationId: ChatConversationId;
      loading: boolean;
    }
  | { type: 'messages/resetCursor'; conversationId: ChatConversationId }
  | {
      type: 'messages/registerPage';
      conversationId: ChatConversationId;
      page: MessagePageRecord;
      position?: 'older' | 'newer' | 'replace';
    }
  | {
      type: 'messages/evictPage';
      conversationId: ChatConversationId;
      pageId: MessagePageId;
    }
  | {
      type: 'messages/updateWindow';
      conversationId: ChatConversationId;
      windowStart?: number;
      windowEnd?: number;
      pinnedPageIds?: MessagePageId[];
    }
  | {
      type: 'messages/rehydratePage';
      conversationId: ChatConversationId;
      page: MessagePageRecord;
      messages: ChatDomainMessage[];
    }
  | { type: 'messages/trimWindow'; conversationId: ChatConversationId }
  | { type: 'selection/setConversation'; conversationId: ChatConversationId | null }
  | { type: 'loading/setConversations'; loading: boolean }
  | {
      type: 'loading/setMessages';
      conversationId: ChatConversationId;
      loading: boolean;
    }
  | { type: 'unread/set'; unread: Partial<UnreadState> }
  | { type: 'connection/set'; connection: Partial<ConnectionState> }
  | { type: 'instances/set'; instances: ChatDomainInstance[] }
  | { type: 'ui/patch'; ui: Partial<UIState> }
  | {
      type: 'conversationVirtualization/setWindow';
      window: Partial<ConversationVirtualizationState>;
    }
  | { type: 'conversationVirtualization/setEnabled'; enabled: boolean }
  | {
      type: 'messageVirtualization/setWindow';
      window: Partial<MessageVirtualizationState>;
    }
  | { type: 'messageVirtualization/setEnabled'; enabled: boolean }
  | { type: 'hydrate/partial'; state: Partial<ChatDomainState> }
  | { type: 'store/reset' }
  | { type: 'commands/begin'; token: string; command: import('./commandState').ChatCommandName; conversationId?: ChatConversationId; snapshot: import('./commandState').CommandRollbackSnapshot }
  | { type: 'commands/confirm'; token: string }
  | { type: 'commands/rollback'; token: string };

export type ChatDomainListener = (state: ChatDomainState, action: ChatDomainAction) => void;

export type ChatDomainEventBus = {
  applySocketEvent(event: ChatDomainEvent): void;
  applyRepositoryResponse(source: string, payload: unknown): void;
  applyCommandResult(command: string, payload: unknown): void;
  applyReconnect(): void;
  applyBootstrap(params?: {
    instanceIds?: ChatInstanceId[];
    inboxScope?: ChatInboxScope;
    hydrateInbox?: boolean;
  }): void;
  applyReset(): void;
};

export type ChatDomainHydration = {
  hydrateFromRepository(snapshot: unknown): void;
  markHydrated(scope: 'conversations' | 'messages' | 'instances'): void;
};

export type ChatDomainPersistence = {
  loadDraft(conversationId: ChatConversationId): string | null;
  saveDraft(conversationId: ChatConversationId, draft: string): void;
  loadSelection(): Partial<SelectionState> | null;
  saveSelection(selection: Partial<SelectionState>): void;
  loadScroll(conversationId: ChatConversationId): number | null;
  saveScroll(conversationId: ChatConversationId, offset: number): void;
  loadFilters(): Partial<UIState> | null;
  saveFilters(filters: Partial<UIState>): void;
};

export type ChatDomainStore = {
  readonly version: 'F5.0';
  getState(): Readonly<ChatDomainState>;
  dispatch(action: ChatDomainAction): void;
  /** F6.5 — aplica várias actions e notifica subscribers uma vez. */
  dispatchBatch?(actions: readonly ChatDomainAction[]): void;
  subscribe(listener: ChatDomainListener): () => void;
  reset(): void;
  selectors: ChatDomainSelectors;
  events: ChatDomainEventBus;
  hydration: ChatDomainHydration;
  persistence: ChatDomainPersistence;
};

export type ChatDomainSelectors = {
  selectConversation(
    state: ChatDomainState,
    id: ChatConversationId,
  ): ChatDomainConversation | null;
  selectConversations(state: ChatDomainState): readonly ChatDomainConversation[];
  selectMessages(
    state: ChatDomainState,
    conversationId: ChatConversationId,
  ): readonly ChatDomainMessage[];
  selectUnread(state: ChatDomainState): UnreadState;
  selectSelectedConversation(state: ChatDomainState): ChatDomainConversation | null;
  selectConnection(state: ChatDomainState): ConnectionState;
  selectInstances(state: ChatDomainState): readonly ChatDomainInstance[];
  selectLoadingConversations(state: ChatDomainState): boolean;
};
