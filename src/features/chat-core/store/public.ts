/**
 * F5.7 — API pública do Domain Store para a UI.
 *
 * Componentes devem importar apenas deste módulo (ou hooks exportados aqui).
 * Não importar `session`, `actions`, `integration` ou `syncStoreFrom*` na UI.
 */

export { shouldUseChatDomainStore } from './flags';
export {
  isChatStoreSourceOfTruth,
  ensureChatDomainStoreSession,
  readStoreConversationCount,
  applyStoreMessages,
  applyStoreConversationsUiUpdate,
  applyStoreConversationUpsert,
  applyStoreConversationPartialPatch,
  applyStoreConversationRemove,
  setStoreLoadingConversations,
  setStoreLoadingMessages,
} from './consolidation';
export { applyFloatingMessagesUpdater } from './messageMutations';
export { useChatConversationList } from './hooks/useChatConversationList';
export { useChatMessages } from './hooks/useChatMessages';
export { useChatSelection } from './hooks/useChatSelection';
export { useFloatingConversationListData } from './hooks/useFloatingConversationListData';
export { useFloatingConversationMessages } from './hooks/useFloatingConversationMessages';
export { useFloatingConversationMeta } from './hooks/useFloatingConversationMeta';
export { useConversationCursor } from './hooks/useConversationCursor';
export { useLoadMoreMessages } from './hooks/useLoadMoreMessages';
export { useConversationWindow } from './hooks/useConversationWindow';
export { useWindowMemory } from './hooks/useWindowMemory';
export { useConversationWarmup } from '../prefetch/useConversationWarmup';
export {
  useConversationVirtualization,
  useConversationScroll,
} from '../virtualization';
export {
  useMessageVirtualization,
  useMessageScroll,
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
export {
  selectVisibleMessages,
  selectMessageVirtualWindow,
  selectMessageOverscan,
  selectMessageRenderCount,
  selectComputedMessageWindow,
} from './messageVirtualSelectors';
export {
  captureScrollAnchor,
  restoreScrollAnchor,
  saveConversationScrollAnchor,
  loadConversationScrollAnchor,
} from './scrollPreservation';
export {
  setWindowCacheLimitsForTests,
  getWindowCacheLimits,
  buildPageRecord,
} from './windowCacheEngine';
export type {
  MessagePageId,
  MessagePageRecord,
  ConversationWindowState,
  WindowCacheLimits,
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
export {
  setConversationVirtualConfigForTests,
  getConversationVirtualConfig,
  DEFAULT_CONVERSATION_ROW_HEIGHT,
  DEFAULT_CONVERSATION_OVERSCAN,
  setMessageVirtualConfigForTests,
  getMessageVirtualConfig,
  DEFAULT_MESSAGE_ROW_HEIGHT,
  DEFAULT_MESSAGE_OVERSCAN,
} from '../virtualization';
export type { ConversationVirtualizationState } from './conversationVirtualizationState';
export type { MessageVirtualizationState } from './messageVirtualizationState';
