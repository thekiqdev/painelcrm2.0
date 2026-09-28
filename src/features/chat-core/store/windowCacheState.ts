/**
 * F6.2 — helpers para ler/gravar janela no MessageState.
 */

import type { ChatConversationId } from '../domain/types';
import type { MessageState } from './types';
import type { ConversationWindowState, MessagePageId, MessagePageRecord } from './windowCacheTypes';
import { createEmptyConversationWindow } from './windowCacheEngine';

export function readConversationWindow(
  messages: MessageState,
  conversationId: ChatConversationId,
): ConversationWindowState {
  const residentPageIds = messages.residentPagesByConversationId[conversationId] ?? [];
  return {
    residentPageIds,
    cachedPages: messages.cachedPagesByConversationId[conversationId] ?? {},
    evictedPageIds: messages.evictedPagesByConversationId[conversationId] ?? [],
    windowStart: messages.windowStartByConversationId[conversationId] ?? 0,
    windowEnd:
      messages.windowEndByConversationId[conversationId] ??
      (residentPageIds.length > 0 ? residentPageIds.length - 1 : -1),
    memoryFootprint: messages.memoryFootprintByConversationId[conversationId] ?? 0,
    pinnedPageIds:
      residentPageIds.length > 0
        ? (() => {
            const newest = residentPageIds[residentPageIds.length - 1]!;
            const cached = messages.cachedPagesByConversationId[conversationId] ?? {};
            return Object.values(cached)
              .filter((p) => p.pinned || p.id === newest)
              .map((p) => p.id);
          })()
        : [],
  };
}

export function writeConversationWindow(
  messages: MessageState,
  conversationId: ChatConversationId,
  window: ConversationWindowState,
): MessageState {
  return {
    ...messages,
    residentPagesByConversationId: {
      ...messages.residentPagesByConversationId,
      [conversationId]: window.residentPageIds,
    },
    windowStartByConversationId: {
      ...messages.windowStartByConversationId,
      [conversationId]: window.windowStart,
    },
    windowEndByConversationId: {
      ...messages.windowEndByConversationId,
      [conversationId]: window.windowEnd,
    },
    cachedPagesByConversationId: {
      ...messages.cachedPagesByConversationId,
      [conversationId]: window.cachedPages,
    },
    evictedPagesByConversationId: {
      ...messages.evictedPagesByConversationId,
      [conversationId]: window.evictedPageIds,
    },
    memoryFootprintByConversationId: {
      ...messages.memoryFootprintByConversationId,
      [conversationId]: window.memoryFootprint,
    },
  };
}

export function resetConversationWindowMaps(
  messages: MessageState,
  conversationId: ChatConversationId,
): MessageState {
  return writeConversationWindow(messages, conversationId, createEmptyConversationWindow());
}

export type { MessagePageId, MessagePageRecord, ConversationWindowState };
