/**
 * F5.0 — Domain Store (fundação).
 *
 * NÃO exportar via `chat-core/index.ts` até F5.1+.
 * Nenhum componente de UI deve importar este módulo nesta sprint.
 */

export { createChatDomainStore } from './createStore';
export type { CreateChatDomainStoreOptions } from './createStore';

export { createInitialChatDomainState } from './state';
export { chatDomainSelectors } from './selectors';
export { chatDomainActionCreators, reduceChatDomainState } from './actions';
export { createChatDomainSubscriptionRegistry } from './subscriptions';
export { createChatDomainEventBus } from './events';
export { createChatDomainHydration } from './hydration';
export { createChatDomainPersistence } from './persistence';

export { shouldUseChatDomainStore } from './flags';
export * from './public';
export {
  syncStoreFromRepositoryResponse,
  syncStoreFromSocketEvent,
  syncStoreFromCommandResult,
  applyChatStoreBootstrap,
  applyChatStoreReset,
  applyChatStoreReconnect,
} from './integration';
export { compareStoreVsRepository, compareConversationCount, compareMessageCount } from './shadowValidation';
export { getChatStoreMetricsSnapshot, resetChatStoreMetrics } from './metrics';
export {
  isChatStoreSourceOfTruth,
  applyStoreConversationList,
  applyStoreMessages,
  setStoreLoadingConversations,
  setStoreLoadingMessages,
} from './consolidation';
export {
  recordChatRenderMs,
  recordCommandLatency,
  recordSocketLatency,
  recordStoreUpdate,
  recordSelectorExecution,
  recordStoreSubscription,
  getConsolidatedMetricsSnapshot,
  resetConsolidatedMetrics,
} from './consolidatedMetrics';
export {
  selectConversationById,
  selectConversationIds,
  selectConversationPreview,
  selectConversationOrdering,
  selectConversationsForUi,
  sortDomainConversations,
} from './conversationSelectors';
export {
  recordFloatingConversationRender,
  getFloatingConversationMetricsSnapshot,
  resetFloatingConversationMetrics,
} from './floatingMetrics';
export {
  selectMessage,
  selectConversationMessages,
  selectMessages,
  selectLastMessage,
  selectMessageCount,
  selectMessageLoading,
  selectMessageVersion,
  selectMessagesForUi,
  sortDomainMessages,
} from './messageSelectors';
export {
  recordFloatingMessageRender,
  recordFloatingMessageAppendLatency,
  recordFloatingSocketApplyLatency,
  getFloatingMessageMetricsSnapshot,
  resetFloatingMessageMetrics,
} from './floatingMessageMetrics';
export { applyFloatingMessagesUpdater } from './messageMutations';
export {
  recordCommandExecutionMs,
  recordCommandOptimisticLatency,
  recordCommandConfirmLatency,
  recordCommandRollbackLatency,
  recordCommandFailure,
  recordCommandRetry,
  recordCommandRollbackCount,
  recordCommandOptimisticCount,
  getCommandMetricsSnapshot,
  resetCommandMetrics,
} from './commandMetrics';
export { createInitialCommandState } from './commandState';
export type { ChatCommandName, CommandSliceState } from './commandState';
export {
  recordChatConversationRender,
  recordChatMessagesRender,
  getChatPrincipalMetricsSnapshot,
  resetChatPrincipalMetrics,
} from './chatMetrics';
export {
  selectCurrentConversation,
  selectConversationUnread,
  selectConversationCount,
  selectConversationOrder,
  selectSelectedConversationForUi,
  selectHasMoreMessages,
  selectChatMessagesForUi,
  selectChatConversationsForUi,
  selectConversationLoading as selectChatConversationLoading,
  selectMessagesLoading as selectChatMessagesLoadingState,
} from './chatSelectors';
export { getChatDomainStoreSession, resetChatDomainStoreSession, setChatDomainStoreSessionForTests } from './session';

export type {
  ChatDomainState,
  ChatDomainStore,
  ChatDomainAction,
  ChatDomainListener,
  ChatDomainSelectors,
  ChatDomainEventBus,
  ChatDomainHydration,
  ChatDomainPersistence,
  ConversationState,
  MessageState,
  SelectionState,
  ComposeState,
  LoadingState,
  UnreadState,
  ConnectionState,
  InstanceState,
  UIState,
} from './types';
