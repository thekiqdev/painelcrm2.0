/**
 * Chat Core — API pública do módulo (F0 Foundation).
 *
 * @see docs/architecture/CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md
 *
 * Em F0 estes exports existem para contratos e testes unitários.
 * A UI legada NÃO deve importar `chatCore` para substituir fluxos —
 * isso ocorrerá apenas com flags de fase nas sprints F1+.
 */

export { chatCore, bootstrapChatCoreFoundation } from './core/chatCore';
export {
  loadInboxCommand,
  clearInboxCommand,
  loadMoreInboxCommand,
  forceReloadInboxCommand,
  invalidateInboxFreshness,
  loadMessagesCommand,
  openConversationMessagesCommand,
  loadMessagesCursorCommand,
  resetConversationCursorCommand,
  warmInboxFromPageCache,
  markInboxFreshFromClient,
  scheduleInboxSoftReconcileOnRealtimeConnected,
  mirrorStoreInboxToPageCache,
  mirrorStoreMessagesToPageCache,
  attachInboxPageCacheMirror,
  chatCoreCommands,
} from './core/commands';
export type { LoadInboxParams, LoadInboxResult, LoadInboxSurface } from './core/loadInbox';
export type {
  WarmInboxFromPageCacheParams,
  WarmInboxFromPageCacheResult,
} from './core/warmInboxFromPageCache';
export {
  getInboxPageMeta,
  getEffectiveInboxFreshTtlMs,
  isChatRealtimeConnectedForInboxFresh,
  DEFAULT_INBOX_PAGE_SIZE,
  INBOX_LOAD_TTL_MS,
  INBOX_FRESH_TTL_MS,
  INBOX_FRESH_TTL_DISCONNECTED_MS,
  mergeConversationLists,
} from './core/loadInbox';
export { INBOX_PAGE_CACHE_MIRROR_MAX } from './core/inboxPageCacheMirror';
export { logInboxCacheEvent } from './core/inboxCacheDiag';
export type { InboxCacheDiagEvent } from './core/inboxCacheDiag';
export type { LoadMessagesResult, LoadMessagesCommandOptions } from './core/loadMessages';
export type {
  LoadMessagesCursorParams,
  LoadMessagesCursorResult,
} from './core/loadMessagesCursor';
export type { GetMessagesPageParams, MessagesPageResult } from './core/messagesPageFetch';
export { DEFAULT_MESSAGES_PAGE_SIZE } from './core/messagesPageFetch';
export type { ChatCorePublicApi, ChatCoreCommands, ChatCoreSelectors } from './domain/public-api';
export { ChatCoreNotWiredError } from './domain/public-api';
export type {
  ChatDomainConversation,
  ChatDomainMessage,
  ChatDomainInstance,
  ChatDomainEvent,
  ChatDomainEventKind,
  ChatAttendanceCounts,
  ChatInboxScope,
  ChatConversationId,
  ChatMessageId,
  ChatInstanceId,
} from './domain/types';

export {
  isChatPhaseFlagEnabled,
  isChatWsPatchFlagEnabled,
  isChatF3FlagEnabled,
  shouldUseChatInstanceRegistry,
  shouldUseChatUnreadEngine,
  shouldUseChatAttendanceReconcile,
  getChatPhaseFlagsSnapshot,
  getChatWsPatchFlagsFromEnv,
  getChatF3FlagsFromEnv,
  isChatWsPatchPhaseStable,
  isChatF3PhaseStable,
  CHAT_PHASE_TO_FLAG,
} from './feature-flags';
export type { ChatMigrationPhaseFlag, ChatWsPatchFlag, ChatF3Flag } from './feature-flags';

export { chatRepository, createChatRepository } from './repository/chatRepository';
export type { ChatRepository } from './repository/chatRepository';

export { isChatStoreRealtimeSourceOfTruth } from './realtime/policy';
export {
  chatRealtimeBridge,
  createChatRealtimeBridge,
  acquireSharedChatSocket,
  shouldUseSingleChatSocket,
} from './realtime/bridge';
export type { ChatRealtimeBridge, ChatRealtimeBridgeStatus } from './realtime/bridge';

export {
  CHAT_WS_EVENTS_V2,
  CHAT_WS_EVENTS_LEGACY,
} from './realtime/contracts';
export {
  normalizeSocketEventByName,
  normalizeMessageCreatedEvent,
  normalizeConversationUpdatedEvent,
  normalizeConversationDeletedEvent,
  normalizeMessageUpdatedEvent,
  normalizeAttendanceUpdatedEvent,
} from './realtime/normalize';

export {
  recordChatHttpRequest,
  recordChatSocket,
  recordChatTiming,
  recordChatRealtimeUpdate,
  recordChatWsPatchAttempt,
  recordChatF3ListInstancesAccess,
  recordChatF3AttendanceCountsAccess,
  recordChatF3ReconcileExecuted,
  recordChatF3ReconcileAvoided,
  markChatCoreTiming,
  measureChatCoreTiming,
  getChatBaselineSnapshot,
  getChatWsPatchStatistics,
  getChatF3PerformanceStatistics,
  resetChatBaselineMetrics,
  resetChatWsPatchMetrics,
  resetChatF3PerformanceMetrics,
} from './metrics/baseline';
export type {
  ChatBaselineSnapshot,
  ChatWsPatchMetricSample,
  ChatWsPatchEventKindStat,
  ChatWsPatchStatisticsSnapshot,
  ChatF3PerfMetricSample,
  ChatF3EndpointReductionStat,
  ChatF3PerformanceStatisticsSnapshot,
} from './metrics/baseline';

export {
  isChatPerformanceTelemetryEnabled,
  beginPerfScenario,
  endPerfScenario,
  getLastScenarioResult,
} from './metrics/performanceMetrics';
export type { PerfScenario, PerfCountersSnapshot } from './metrics/performanceMetrics';
export { useChatPerfRender, recordRender, getRenderMetricsSnapshot } from './metrics/renderMetrics';
export { recordReducer, getReducerMetricsSnapshot } from './metrics/reducerMetrics';
export { timeSelector, getSelectorMetricsSnapshot } from './metrics/selectorMetrics';
export {
  recordSubscriptionNotify,
  getSubscriptionMetricsSnapshot,
} from './metrics/subscriptionMetrics';
export { recordHttpMetric, getHttpMetricsSnapshot } from './metrics/httpMetrics';
export { recordSocketApply, getSocketMetricsSnapshot } from './metrics/socketMetrics';
export {
  sampleStoreMemory,
  projectMemoryBaseline,
  getMemoryMetricsSnapshot,
} from './metrics/memoryMetrics';
export {
  getChatPerformanceReport,
  logChatPerformanceReport,
  resetChatPerformanceMetrics,
} from './metrics/report';
export type { ChatPerformanceReport } from './metrics/report';
export {
  getCursorMetricsSnapshot,
  resetCursorMetrics,
} from './metrics/cursorMetrics';
export {
  getLoadMoreMetricsSnapshot,
  resetLoadMoreMetrics,
} from './metrics/loadMoreMetrics';
export {
  getWindowMetricsSnapshot,
  resetWindowMetrics,
} from './metrics/windowMetrics';
export {
  getConversationVirtualizationMetricsSnapshot,
  resetConversationVirtualizationMetrics,
} from './metrics/conversationVirtualizationMetrics';
export {
  getMessageVirtualizationMetricsSnapshot,
  resetMessageVirtualizationMetrics,
} from './metrics/messageVirtualizationMetrics';
export {
  getRenderOptimizationMetricsSnapshot,
  resetRenderOptimizationMetrics,
} from './metrics/renderOptimizationMetrics';
export {
  getPrefetchMetricsSnapshot,
  resetPrefetchMetrics,
} from './metrics/prefetchMetrics';
export {
  getZeroPollingMetricsSnapshot,
  resetZeroPollingMetricsForTests,
  recordManualRefresh,
  recordSocketUpdate,
  recordPollingRemoved,
  recordWebhookUpdate,
  recordAutomaticHttpRefresh,
  recordRuntimeCacheHit,
  recordRuntimeCacheMiss,
} from './metrics/zeroPollingMetrics';
export type { ZeroPollingMetricsSnapshot } from './metrics/zeroPollingMetrics';
export {
  getConversationRuntimeMetricsSnapshot,
  resetConversationRuntimeMetricsForTests,
  recordConversationDivergenceIfAny,
} from './metrics/conversationRuntimeMetrics';
export type { ConversationRuntimeMetricsSnapshot } from './metrics/conversationRuntimeMetrics';
export {
  getPreviewMessagesMetricsSnapshot,
  resetPreviewMessagesMetricsForTests,
} from './metrics/previewMessagesMetrics';
export type { PreviewMessagesMetricsSnapshot } from './metrics/previewMessagesMetrics';
export {
  getOpenConversationPipelineMetricsSnapshot,
  resetOpenConversationPipelineMetricsForTests,
  OPEN_CONVERSATION_PIPELINE_ORDER,
} from './metrics/openConversationPipelineMetrics';
export type { OpenConversationPipelineMetricsSnapshot } from './metrics/openConversationPipelineMetrics';
export {
  getCrmDetailProjectionMetricsSnapshot,
  resetCrmDetailProjectionMetricsForTests,
} from './metrics/crmDetailProjectionMetrics';
export type { CrmDetailProjectionMetricsSnapshot } from './metrics/crmDetailProjectionMetrics';
export {
  reconcileCrmDetailWithConversationLink,
  resolveCrmLinkKind,
  conversationCrmProfileQueryKey,
} from './crm/crmDetailProjection';

export {
  tryApplyChatWsPatch,
  getChatWsPatchFlagsSnapshot,
  isChatWsPatchPhaseComplete,
  isMessageCreatedPayloadSufficient,
  isConversationUpdatedPayloadSufficient,
  isMessageUpdatedPayloadSufficient,
  isConversationDeletedPayloadSufficient,
  isAttendanceUpdatedPayloadSufficient,
} from './ws-patch';
export type { ChatWsPatchResult, ChatWsPatchContext } from './ws-patch';

export {
  ensureChatF3RuntimeWired,
  bootstrapChatF3Session,
  ensureChatInstances,
  fetchChatAttendanceCounts,
  getChatGlobalUnreadCount,
  subscribeChatUnreadEngine,
  subscribeChatInstanceRegistry,
  scheduleChatAttendanceReconcile,
  requestChatReconcile,
  getChatReconcileDiagnostics,
} from './runtime';
export type { ChatReconcileReason } from './reconcile';
