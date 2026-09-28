/**
 * F6.2 — selectors do Sliding Window Cache.
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from './types';
import { timeSelector } from '../metrics/selectorMetrics';
import { readConversationWindow } from './windowCacheState';
import type { MessagePageId, MessagePageRecord } from './windowCacheTypes';

export function selectResidentPages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): MessagePageId[] {
  return timeSelector(
    'selectResidentPages',
    () => state.messages.residentPagesByConversationId[conversationId] ?? [],
  );
}

export function selectWindowBounds(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): { windowStart: number; windowEnd: number } {
  return timeSelector('selectWindowBounds', () => ({
    windowStart: state.messages.windowStartByConversationId[conversationId] ?? 0,
    windowEnd: state.messages.windowEndByConversationId[conversationId] ?? -1,
  }));
}

export function selectConversationMemoryUsage(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): {
  memoryFootprint: number;
  residentPages: number;
  residentMessages: number;
  evictedPages: number;
} {
  return timeSelector('selectConversationMemoryUsage', () => {
    const window = readConversationWindow(state.messages, conversationId);
    let residentMessages = 0;
    for (const id of window.residentPageIds) {
      residentMessages += window.cachedPages[id]?.messageIds.length ?? 0;
    }
    return {
      memoryFootprint: window.memoryFootprint,
      residentPages: window.residentPageIds.length,
      residentMessages,
      evictedPages: window.evictedPageIds.length,
    };
  });
}

export function selectEvictedPages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): MessagePageId[] {
  return timeSelector(
    'selectEvictedPages',
    () => state.messages.evictedPagesByConversationId[conversationId] ?? [],
  );
}

export function selectPinnedPages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): MessagePageId[] {
  return timeSelector('selectPinnedPages', () => {
    const window = readConversationWindow(state.messages, conversationId);
    return window.pinnedPageIds;
  });
}

export function selectCachedPages(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): Record<MessagePageId, MessagePageRecord> {
  return timeSelector(
    'selectCachedPages',
    () => state.messages.cachedPagesByConversationId[conversationId] ?? {},
  );
}

export function selectConversationWindow(
  state: ChatDomainState,
  conversationId: ChatConversationId,
) {
  return timeSelector('selectConversationWindow', () =>
    readConversationWindow(state.messages, conversationId),
  );
}
