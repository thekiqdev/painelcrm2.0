export { ensureChatF3RuntimeWired, bootstrapChatF3Session } from './bootstrap';
export {
  ensureChatInstances,
  reconcileChatInstances,
  getChatInstanceRegistrySnapshot,
  subscribeChatInstanceRegistry,
  getChatConnectedInstancesFromRegistry,
  getChatEnabledInstanceIdsFromRegistry,
  filterConnectedChatInstances,
  filterEnabledChatInstanceIds,
  refreshInboxInstanceVisibility,
  getInboxInstanceVisibilitySnapshot,
  subscribeInboxInstanceVisibility,
  applyInboxInstanceVisibilityFromInstances,
  resetInboxInstanceVisibility,
  resetInboxInstanceVisibilityForTests,
  useInboxInstanceVisibility,
} from '../instance-registry';
export type { InboxInstanceVisibilitySnapshot } from '../instance-registry';
export {
  fetchChatAttendanceCounts,
  reconcileChatAttendanceCounts,
  getChatUnreadEngineCounts,
  getChatGlobalUnreadCount,
  subscribeChatUnreadEngine,
  scheduleChatAttendanceReconcile,
  applyChatUnreadIncomingMessage,
} from '../unread-engine';
export {
  shouldUseChatInstanceRegistry,
  shouldUseChatUnreadEngine,
  shouldUseChatAttendanceReconcile,
  isChatF3FlagEnabled,
  getChatF3FlagsFromEnv,
  isChatF3PhaseStable,
} from '../feature-flags';
export type { ChatF3Flag } from '../feature-flags';
export { requestChatReconcile, getChatReconcileDiagnostics } from '../reconcile';
export type { ChatReconcileReason, ChatReconcileScope } from '../reconcile';
