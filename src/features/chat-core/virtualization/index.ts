/**
 * F6.3 / F6.4 — Conversation + Message Virtualization (public barrel).
 */

export {
  createConversationVirtualEngine,
  computeVisibleConversationRange,
} from './conversationVirtualEngine';
export type {
  ConversationVirtualEngine,
  ConversationVirtualEngineState,
} from './conversationVirtualEngine';
export {
  createConversationHeightCache,
  estimateConversationListHeight,
} from './conversationHeightCache';
export type { ConversationHeightCache } from './conversationHeightCache';
export {
  computeConversationWindow,
  computeConversationOffsets,
  findStartIndex,
} from './conversationWindow';
export {
  DEFAULT_CONVERSATION_ROW_HEIGHT,
  DEFAULT_CONVERSATION_OVERSCAN,
  getConversationVirtualConfig,
  setConversationVirtualConfigForTests,
} from './conversationOverscan';
export type {
  ConversationVirtualWindow,
  ConversationVirtualItemLayout,
  ConversationVirtualConfig,
} from './conversationOverscan';
export { useConversationVirtualization } from './useConversationVirtualization';
export type {
  UseConversationVirtualizationParams,
  UseConversationVirtualizationResult,
  ConversationVirtualListItem,
} from './useConversationVirtualization';
export { useConversationScroll } from './useConversationScroll';
export type {
  UseConversationScrollParams,
  UseConversationScrollResult,
} from './useConversationScroll';

export {
  createMessageVirtualEngine,
  computeVisibleMessageRange,
} from './messageVirtualEngine';
export type {
  MessageVirtualEngine,
  MessageVirtualEngineState,
} from './messageVirtualEngine';
export { createMessageHeightCache } from './messageHeightCache';
export type { MessageHeightCache } from './messageHeightCache';
export {
  DEFAULT_MESSAGE_ROW_HEIGHT,
  DEFAULT_MESSAGE_OVERSCAN,
  getMessageVirtualConfig,
  setMessageVirtualConfigForTests,
} from './messageOverscan';
export type {
  MessageVirtualWindow,
  MessageVirtualItemLayout,
  MessageVirtualConfig,
} from './messageOverscan';
export { useMessageVirtualization } from './useMessageVirtualization';
export type {
  UseMessageVirtualizationParams,
  UseMessageVirtualizationResult,
  MessageVirtualListItem,
} from './useMessageVirtualization';
export { useMessageScroll } from './useMessageScroll';
export type {
  UseMessageScrollParams,
  UseMessageScrollResult,
} from './useMessageScroll';
