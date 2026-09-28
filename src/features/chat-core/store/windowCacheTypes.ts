/**
 * F6.2 — tipos do Sliding Window Cache.
 */

import type { ChatConversationId, ChatMessageId } from '../domain/types';

export type MessagePageLifecycle =
  | 'Loaded'
  | 'Resident'
  | 'Pinned'
  | 'Evicted'
  | 'Reloaded';

export type MessagePageId = string;

export type MessagePageRecord = {
  id: MessagePageId;
  conversationId: ChatConversationId;
  messageIds: ChatMessageId[];
  oldestMessageId: ChatMessageId | null;
  newestMessageId: ChatMessageId | null;
  /** Cursor usado para carregar esta página (metadata; nunca perdido no evict). */
  cursorAtLoad: string | null;
  loadedAt: number;
  lastAccessAt: number;
  pinned: boolean;
  status: MessagePageLifecycle;
};

export type ConversationWindowState = {
  residentPageIds: MessagePageId[];
  cachedPages: Record<MessagePageId, MessagePageRecord>;
  evictedPageIds: MessagePageId[];
  windowStart: number;
  windowEnd: number;
  memoryFootprint: number;
  pinnedPageIds: MessagePageId[];
};

export type WindowCacheLimits = {
  maxResidentPages: number;
  maxMessagesEstimate: number;
  bytesPerMessage: number;
};

export const DEFAULT_WINDOW_CACHE_LIMITS: WindowCacheLimits = {
  maxResidentPages: 5,
  maxMessagesEstimate: 250,
  bytesPerMessage: 400,
};
