/**
 * F5.0 — Domain Store (fundação).
 *
 * NÃO exportar via `chat-core/index.ts` até F5.1+.
 * Nenhum componente de UI deve importar este módulo nesta sprint.
 */

export { createChatDomainStore } from './createStore';
export type { CreateChatDomainStoreOptions } from './createStore';

export { createInitialChatDomainState, EMPTY_CHAT_DOMAIN_STATE } from './state';
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

export { useConversationCursor } from './hooks/useConversationCursor';
export { useLoadMoreMessages } from './hooks/useLoadMoreMessages';
export { useConversationWindow } from './hooks/useConversationWindow';
export { useWindowMemory } from './hooks/useWindowMemory';
export { useConversationWarmup } from '../prefetch/useConversationWarmup';
export {
  useConversationVirtualization,
  useConversationScroll,
  createConversationVirtualEngine,
  computeVisibleConversationRange,
  setConversationVirtualConfigForTests,
  getConversationVirtualConfig,
  DEFAULT_CONVERSATION_ROW_HEIGHT,
  DEFAULT_CONVERSATION_OVERSCAN,
  useMessageVirtualization,
  useMessageScroll,
  createMessageVirtualEngine,
  computeVisibleMessageRange,
  setMessageVirtualConfigForTests,
  getMessageVirtualConfig,
  DEFAULT_MESSAGE_ROW_HEIGHT,
  DEFAULT_MESSAGE_OVERSCAN,
} from '../virtualization';


export {
  selectConversationCursor,
  selectConversationHasMore,
  selectConversationLoadingMore,
  selectConversationLoadedPages,
  selectConversationCanLoadMore,
} from './cursorSelectors';
export type { ConversationCursorState } from './cursorSelectors';
export {
  selectResidentPages,
  selectWindowBounds,
  selectConversationMemoryUsage,
  selectEvictedPages,
  selectPinnedPages,
  selectCachedPages,
  selectConversationWindow,
} from './windowSelectors';
export {
  selectVisibleConversations,
  selectConversationVirtualWindow,
  selectConversationOverscan,
  selectConversationRenderCount,
  selectComputedConversationWindow,
} from './conversationVirtualSelectors';
export type { ConversationVirtualizationState } from './conversationVirtualizationState';
export {
  selectVisibleMessages,
  selectMessageVirtualWindow,
  selectMessageOverscan,
  selectMessageRenderCount,
  selectComputedMessageWindow,
} from './messageVirtualSelectors';
export type { MessageVirtualizationState } from './messageVirtualizationState';
export {
  mergePrependMessages,
  sortMessagesChronological,
  encodeLegacyMessageCursor,
  decodeLegacyMessageCursor,
} from './messageMerge';
export {
  captureScrollAnchor,
  restoreScrollAnchor,
  saveConversationScrollAnchor,
  loadConversationScrollAnchor,
  clearConversationScrollAnchor,
  resetScrollAnchorsForTests,
} from './scrollPreservation';
export type { ScrollAnchorSnapshot } from './scrollPreservation';
export {
  setWindowCacheLimitsForTests,
  getWindowCacheLimits,
  buildPageRecord,
  makeMessagePageId,
} from './windowCacheEngine';
export type {
  MessagePageId,
  MessagePageRecord,
  ConversationWindowState,
  WindowCacheLimits,
  MessagePageLifecycle,
} from './windowCacheTypes';
export {
  getWindowMetricsSnapshot,
  resetWindowMetrics,
} from '../metrics/windowMetrics';
export {
  getConversationVirtualizationMetricsSnapshot,
  resetConversationVirtualizationMetrics,
} from '../metrics/conversationVirtualizationMetrics';
export {
  getMessageVirtualizationMetricsSnapshot,
  resetMessageVirtualizationMetrics,
} from '../metrics/messageVirtualizationMetrics';
export {
  getRenderOptimizationMetricsSnapshot,
  resetRenderOptimizationMetrics,
} from '../metrics/renderOptimizationMetrics';
export {
  getPrefetchMetricsSnapshot,
  resetPrefetchMetrics,
} from '../metrics/prefetchMetrics';
export {
  createMemoizedSelector,
  shallowEqual,
  shallowEqualArray,
  conversationsUiEqual,
  messagesUiEqual,
  conversationUiFingerprint,
  messageUiFingerprint,
} from './selectorMemo';
export {
  dispatchStoreActionsBatched,
  enqueueSocketActions,
  runSocketBatch,
  settleSocketActionQueue,
  flushSocketActionQueueForTests,
  resetSocketActionQueueForTests,
} from './storeBatch';
export { useStableSelector } from './hooks/useStableSelector';

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
