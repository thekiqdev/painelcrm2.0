/**
 * F5.0 — reducer estrutural e action creators do Domain Store.
 * Sem lógica de negócio; apenas mutações de estado tipadas.
 */

import type {
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatConversationId,
  ChatInstanceId,
  ChatMessageId,
} from '../domain/types';
import type { ChatDomainAction, ChatDomainState, UnreadState } from './types';
import { createInitialChatDomainState } from './state';
import { applyRollbackSnapshot } from './rollback';
import { mergePrependMessages } from './messageMerge';
import {
  applyEvictionToWindow,
  buildPageRecord,
  getWindowCacheLimits,
  markPageReloaded,
  registerPageInWindow,
  trimConversationWindow,
  touchPageAccess,
} from './windowCacheEngine';
import {
  readConversationWindow,
  resetConversationWindowMaps,
  writeConversationWindow,
} from './windowCacheState';
import {
  logWindowEvent,
  recordWindowEvict,
  recordWindowMove,
  recordWindowRegister,
  recordWindowReload,
} from '../metrics/windowMetrics';
import type { MessagePageId, MessagePageRecord } from './windowCacheTypes';
import type { ConversationVirtualizationState } from './conversationVirtualizationState';
import type { MessageVirtualizationState } from './messageVirtualizationState';
import { syncConversationPreviewFromMessages } from './previewFromMessages';
import { mergeDomainConversationFullUpsert } from './conversationUpsertMerge';
import { recordMessageAppend } from '../metrics/previewMessagesMetrics';

function removeMessageIdsFromConversation(
  state: ChatDomainState,
  conversationId: ChatConversationId,
  removeIds: readonly ChatMessageId[],
): ChatDomainState {
  if (removeIds.length === 0) return state;
  const removeSet = new Set(removeIds);
  const byId = { ...state.messages.byId };
  for (const id of removeSet) {
    delete byId[id];
  }
  const ordered = (state.messages.byConversationId[conversationId] ?? []).filter(
    (id) => !removeSet.has(id),
  );
  return {
    ...state,
    messages: {
      ...state.messages,
      byId,
      byConversationId: {
        ...state.messages.byConversationId,
        [conversationId]: ordered,
      },
      versionByConversationId: bumpMessageVersion(state, conversationId),
    },
  };
}

function applyWindowTrim(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): ChatDomainState {
  const limits = getWindowCacheLimits();
  const current = readConversationWindow(state.messages, conversationId);
  const { window: nextWindow, plan } = trimConversationWindow(current, limits);
  if (plan.pageIdsToEvict.length === 0) {
    return {
      ...state,
      messages: writeConversationWindow(state.messages, conversationId, nextWindow),
    };
  }

  const beforeBytes = current.memoryFootprint;
  let nextState = removeMessageIdsFromConversation(
    state,
    conversationId,
    plan.messageIdsToRemove,
  );
  nextState = {
    ...nextState,
    messages: writeConversationWindow(nextState.messages, conversationId, nextWindow),
  };
  recordWindowEvict(plan.pageIdsToEvict.length, Math.max(0, beforeBytes - nextWindow.memoryFootprint));
  logWindowEvent('evict', {
    conversationId,
    pageIds: plan.pageIdsToEvict,
    removedMessages: plan.messageIdsToRemove.length,
  });
  logWindowEvent('trim', {
    conversationId,
    resident: nextWindow.residentPageIds.length,
    footprint: nextWindow.memoryFootprint,
  });
  return nextState;
}

function bumpMessageVersion(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): Record<ChatConversationId, number> {
  return {
    ...state.messages.versionByConversationId,
    [conversationId]: (state.messages.versionByConversationId[conversationId] ?? 0) + 1,
  };
}

export function reduceChatDomainState(
  state: ChatDomainState,
  action: ChatDomainAction,
): ChatDomainState {
  switch (action.type) {
    case 'conversations/set': {
      const byId = { ...state.conversations.byId };
      const orderedIds: ChatConversationId[] = [];
      for (const conversation of action.conversations) {
        byId[conversation.id] = conversation;
        orderedIds.push(conversation.id);
      }
      return {
        ...state,
        conversations: {
          ...state.conversations,
          byId,
          orderedIds,
        },
      };
    }

    case 'conversations/upsert': {
      const { conversation } = action;
      if (typeof conversation.id !== 'string' || !conversation.id) {
        return state;
      }

      const existing = state.conversations.byId[conversation.id];
      const rawIn =
        conversation.raw && typeof conversation.raw === 'object'
          ? (conversation.raw as Record<string, unknown>)
          : null;
      const leanPatch = rawIn?.__leanRealtimePatch === true;

      // TF3.1 — lean tenant patch: não cria row fantasma; só atualiza preview/at/unread na existente.
      if (leanPatch && !existing) {
        return state;
      }

      const merged = existing
        ? leanPatch
          ? {
              ...existing,
              lastMessagePreview:
                conversation.lastMessagePreview ?? existing.lastMessagePreview,
              lastMessageAt: conversation.lastMessageAt ?? existing.lastMessageAt,
              unreadCount: conversation.unreadCount ?? existing.unreadCount,
              contactName: existing.contactName ?? conversation.contactName,
              waArchived:
                typeof conversation.waArchived === 'boolean'
                  ? conversation.waArchived
                  : existing.waArchived,
              raw:
                existing.raw && typeof existing.raw === 'object'
                  ? {
                      ...(existing.raw as Record<string, unknown>),
                      lastMessagePreview:
                        conversation.lastMessagePreview ?? existing.lastMessagePreview,
                      last_message_preview:
                        conversation.lastMessagePreview ?? existing.lastMessagePreview,
                      lastMessageAt: conversation.lastMessageAt ?? existing.lastMessageAt,
                      last_message_at: conversation.lastMessageAt ?? existing.lastMessageAt,
                      unreadCount: conversation.unreadCount ?? existing.unreadCount,
                      unread_count: conversation.unreadCount ?? existing.unreadCount,
                    }
                  : existing.raw,
            }
          : mergeDomainConversationFullUpsert(existing, conversation)
        : conversation;

      const orderedIds = state.conversations.orderedIds.includes(merged.id)
        ? state.conversations.orderedIds
        : [merged.id, ...state.conversations.orderedIds];
      const next: ChatDomainState = {
        ...state,
        conversations: {
          ...state.conversations,
          byId: { ...state.conversations.byId, [merged.id]: merged },
          orderedIds,
        },
      };
      // Phase 10D — se a thread já está hydrated, Preview deriva das Messages (não do patch).
      return syncConversationPreviewFromMessages(next, merged.id);
    }

    case 'conversations/remove': {
      if (!state.conversations.byId[action.conversationId]) return state;
      const nextById = { ...state.conversations.byId };
      delete nextById[action.conversationId];
      return {
        ...state,
        conversations: {
          ...state.conversations,
          byId: nextById,
          orderedIds: state.conversations.orderedIds.filter((id) => id !== action.conversationId),
        },
        selection:
          state.selection.selectedConversationId === action.conversationId
            ? { ...state.selection, selectedConversationId: null }
            : state.selection,
      };
    }

    case 'messages/set': {
      const byId = { ...state.messages.byId };
      const prevIds = state.messages.byConversationId[action.conversationId] ?? [];
      for (const id of prevIds) {
        delete byId[id];
      }
      const messageIds: ChatMessageId[] = [];
      for (const message of action.messages) {
        if (typeof message.id !== 'string' || !message.id) continue;
        byId[message.id] = message;
        messageIds.push(message.id);
      }
      const cid = action.conversationId;
      // Hidratação completa (F5): reseta paginação — dump integral = 1 página, sem hasMore.
      let messages = {
        ...state.messages,
        byId,
        byConversationId: {
          ...state.messages.byConversationId,
          [cid]: messageIds,
        },
        versionByConversationId: bumpMessageVersion(state, cid),
        lastLoadedCursorByConversationId: {
          ...state.messages.lastLoadedCursorByConversationId,
          [cid]: null,
        },
        cursorByConversationId: {
          ...state.messages.cursorByConversationId,
          [cid]: null,
        },
        nextCursorByConversationId: {
          ...state.messages.nextCursorByConversationId,
          [cid]: null,
        },
        previousCursorByConversationId: {
          ...state.messages.previousCursorByConversationId,
          [cid]: null,
        },
        hasMoreByConversationId: {
          ...state.messages.hasMoreByConversationId,
          [cid]: false,
        },
        loadingMoreByConversationId: {
          ...state.messages.loadingMoreByConversationId,
          [cid]: false,
        },
        loadedPagesByConversationId: {
          ...state.messages.loadedPagesByConversationId,
          [cid]: messageIds.length > 0 ? 1 : 0,
        },
      };
      messages = resetConversationWindowMaps(messages, cid);
      if (messageIds.length > 0) {
        const page = buildPageRecord({
          conversationId: cid,
          pageIndex: 0,
          messageIds,
          pinned: true,
        });
        const window = registerPageInWindow(
          readConversationWindow(messages, cid),
          page,
          'replace',
        );
        messages = writeConversationWindow(messages, cid, window);
        recordWindowRegister(1, messageIds.length);
        logWindowEvent('register', { conversationId: cid, pageId: page.id, position: 'replace' });
        logWindowEvent('pin', { conversationId: cid, pageId: page.id });
      }
      return syncConversationPreviewFromMessages({ ...state, messages }, cid);
    }

    case 'messages/prepend': {
      const { conversationId, messages } = action;
      const byId = { ...state.messages.byId };
      const existingIds = state.messages.byConversationId[conversationId] ?? [];
      const prependIds: ChatMessageId[] = [];
      for (const message of messages) {
        byId[message.id] = message;
        if (!existingIds.includes(message.id) && !prependIds.includes(message.id)) {
          prependIds.push(message.id);
        }
      }
      if (prependIds.length === 0) return state;
      const next: ChatDomainState = {
        ...state,
        messages: {
          ...state.messages,
          byId,
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: [...prependIds, ...existingIds],
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
      return syncConversationPreviewFromMessages(next, conversationId);
    }

    case 'messages/prependPage': {
      const { conversationId, messages } = action;
      const existingIds = state.messages.byConversationId[conversationId] ?? [];
      const merge = mergePrependMessages(existingIds, state.messages.byId, messages);
      const nextCursor =
        action.nextCursor !== undefined
          ? action.nextCursor
          : state.messages.nextCursorByConversationId[conversationId] ?? null;
      const previousCursor =
        action.previousCursor !== undefined
          ? action.previousCursor
          : state.messages.previousCursorByConversationId[conversationId] ?? null;
      const hasMore =
        action.hasMore !== undefined
          ? action.hasMore
          : state.messages.hasMoreByConversationId[conversationId] ?? false;
      const pages = (state.messages.loadedPagesByConversationId[conversationId] ?? 0) + 1;

      if (merge.prepended === 0 && action.nextCursor === undefined && action.hasMore === undefined) {
        return state;
      }

      let nextState: ChatDomainState = {
        ...state,
        messages: {
          ...state.messages,
          byId: { ...state.messages.byId, ...merge.byIdPatch },
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: merge.orderedIds,
          },
          versionByConversationId:
            merge.prepended > 0
              ? bumpMessageVersion(state, conversationId)
              : state.messages.versionByConversationId,
          nextCursorByConversationId: {
            ...state.messages.nextCursorByConversationId,
            [conversationId]: nextCursor,
          },
          previousCursorByConversationId: {
            ...state.messages.previousCursorByConversationId,
            [conversationId]: previousCursor,
          },
          cursorByConversationId: {
            ...state.messages.cursorByConversationId,
            [conversationId]: nextCursor,
          },
          lastLoadedCursorByConversationId: {
            ...state.messages.lastLoadedCursorByConversationId,
            [conversationId]: nextCursor,
          },
          hasMoreByConversationId: {
            ...state.messages.hasMoreByConversationId,
            [conversationId]: hasMore,
          },
          loadedPagesByConversationId: {
            ...state.messages.loadedPagesByConversationId,
            [conversationId]: pages,
          },
          loadingMoreByConversationId: {
            ...state.messages.loadingMoreByConversationId,
            [conversationId]: false,
          },
        },
      };

      // F6.2 — registrar página mais antiga e trim automático da janela.
      if (merge.prepended > 0) {
        const pageMessageIds = messages
          .map((m) => m.id)
          .filter((id): id is ChatMessageId => typeof id === 'string' && Boolean(id));
        const page = buildPageRecord({
          conversationId,
          pageIndex: pages - 1,
          messageIds: pageMessageIds,
          cursorAtLoad: nextCursor,
        });
        const registered = registerPageInWindow(
          readConversationWindow(nextState.messages, conversationId),
          page,
          'older',
        );
        nextState = {
          ...nextState,
          messages: writeConversationWindow(nextState.messages, conversationId, registered),
        };
        recordWindowRegister(registered.residentPageIds.length, pageMessageIds.length);
        recordWindowMove();
        logWindowEvent('register', {
          conversationId,
          pageId: page.id,
          position: 'older',
          resident: registered.residentPageIds.length,
        });
        logWindowEvent('move', {
          conversationId,
          windowStart: registered.windowStart,
          windowEnd: registered.windowEnd,
        });
        nextState = applyWindowTrim(nextState, conversationId);
      }

      return syncConversationPreviewFromMessages(nextState, conversationId);
    }

    case 'messages/setCursor': {
      const cid = action.conversationId;
      const nextCursor =
        action.nextCursor !== undefined
          ? action.nextCursor
          : action.cursor !== undefined
            ? action.cursor
            : state.messages.nextCursorByConversationId[cid] ?? null;
      const previousCursor =
        action.previousCursor !== undefined
          ? action.previousCursor
          : state.messages.previousCursorByConversationId[cid] ?? null;
      const hasMore =
        action.hasMore !== undefined
          ? action.hasMore
          : state.messages.hasMoreByConversationId[cid] ?? Boolean(nextCursor);
      return {
        ...state,
        messages: {
          ...state.messages,
          lastLoadedCursorByConversationId: {
            ...state.messages.lastLoadedCursorByConversationId,
            [cid]: nextCursor,
          },
          cursorByConversationId: {
            ...state.messages.cursorByConversationId,
            [cid]: nextCursor,
          },
          nextCursorByConversationId: {
            ...state.messages.nextCursorByConversationId,
            [cid]: nextCursor,
          },
          previousCursorByConversationId: {
            ...state.messages.previousCursorByConversationId,
            [cid]: previousCursor,
          },
          hasMoreByConversationId: {
            ...state.messages.hasMoreByConversationId,
            [cid]: hasMore,
          },
        },
      };
    }

    case 'messages/setHasMore': {
      return {
        ...state,
        messages: {
          ...state.messages,
          hasMoreByConversationId: {
            ...state.messages.hasMoreByConversationId,
            [action.conversationId]: action.hasMore,
          },
        },
      };
    }

    case 'messages/setLoadingMore': {
      return {
        ...state,
        messages: {
          ...state.messages,
          loadingMoreByConversationId: {
            ...state.messages.loadingMoreByConversationId,
            [action.conversationId]: action.loading,
          },
        },
      };
    }

    case 'messages/resetCursor': {
      const cid = action.conversationId;
      return {
        ...state,
        messages: resetConversationWindowMaps(
          {
            ...state.messages,
            lastLoadedCursorByConversationId: {
              ...state.messages.lastLoadedCursorByConversationId,
              [cid]: null,
            },
            cursorByConversationId: {
              ...state.messages.cursorByConversationId,
              [cid]: null,
            },
            nextCursorByConversationId: {
              ...state.messages.nextCursorByConversationId,
              [cid]: null,
            },
            previousCursorByConversationId: {
              ...state.messages.previousCursorByConversationId,
              [cid]: null,
            },
            hasMoreByConversationId: {
              ...state.messages.hasMoreByConversationId,
              [cid]: false,
            },
            loadingMoreByConversationId: {
              ...state.messages.loadingMoreByConversationId,
              [cid]: false,
            },
            loadedPagesByConversationId: {
              ...state.messages.loadedPagesByConversationId,
              [cid]: 0,
            },
          },
          cid,
        ),
      };
    }

    case 'messages/registerPage': {
      const { conversationId, page } = action;
      const position = action.position ?? 'older';
      const registered = registerPageInWindow(
        readConversationWindow(state.messages, conversationId),
        page,
        position,
      );
      recordWindowRegister(registered.residentPageIds.length, page.messageIds.length);
      logWindowEvent('register', {
        conversationId,
        pageId: page.id,
        position,
        resident: registered.residentPageIds.length,
      });
      if (page.pinned || registered.pinnedPageIds.includes(page.id)) {
        logWindowEvent('pin', { conversationId, pageId: page.id });
      }
      let nextState: ChatDomainState = {
        ...state,
        messages: writeConversationWindow(state.messages, conversationId, registered),
      };
      nextState = applyWindowTrim(nextState, conversationId);
      return nextState;
    }

    case 'messages/evictPage': {
      const { conversationId, pageId } = action;
      const current = readConversationWindow(state.messages, conversationId);
      const page = current.cachedPages[pageId];
      if (!page || page.status === 'Evicted') return state;
      if (current.pinnedPageIds.includes(pageId)) {
        return state;
      }
      const plan = {
        pageIdsToEvict: [pageId],
        messageIdsToRemove: [...page.messageIds],
      };
      const beforeBytes = current.memoryFootprint;
      const nextWindow = applyEvictionToWindow(current, plan);
      let nextState = removeMessageIdsFromConversation(
        state,
        conversationId,
        plan.messageIdsToRemove,
      );
      nextState = {
        ...nextState,
        messages: writeConversationWindow(nextState.messages, conversationId, nextWindow),
      };
      recordWindowEvict(1, Math.max(0, beforeBytes - nextWindow.memoryFootprint));
      logWindowEvent('evict', { conversationId, pageId });
      return nextState;
    }

    case 'messages/updateWindow': {
      const { conversationId } = action;
      let window = readConversationWindow(state.messages, conversationId);
      if (action.windowStart !== undefined || action.windowEnd !== undefined) {
        window = {
          ...window,
          windowStart: action.windowStart ?? window.windowStart,
          windowEnd: action.windowEnd ?? window.windowEnd,
        };
        recordWindowMove();
        logWindowEvent('move', {
          conversationId,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        });
      }
      if (action.pinnedPageIds) {
        const pinSet = new Set(action.pinnedPageIds);
        const cachedPages = { ...window.cachedPages };
        for (const id of window.residentPageIds) {
          const rec = cachedPages[id];
          if (!rec) continue;
          const pinned = pinSet.has(id);
          cachedPages[id] = {
            ...rec,
            pinned,
            status: pinned ? 'Pinned' : rec.status === 'Evicted' ? 'Evicted' : 'Resident',
          };
        }
        window = { ...window, cachedPages, pinnedPageIds: [...action.pinnedPageIds] };
        logWindowEvent('pin', { conversationId, pageIds: action.pinnedPageIds });
      }
      // Touch pinned pages for LRU.
      for (const id of window.pinnedPageIds) {
        window = touchPageAccess(window, id);
      }
      return {
        ...state,
        messages: writeConversationWindow(state.messages, conversationId, window),
      };
    }

    case 'messages/rehydratePage': {
      const { conversationId, page, messages } = action;
      const byId = { ...state.messages.byId };
      const existing = state.messages.byConversationId[conversationId] ?? [];
      const incomingIds: ChatMessageId[] = [];
      for (const message of messages) {
        byId[message.id] = message;
        incomingIds.push(message.id);
      }
      const merge = mergePrependMessages(existing, byId, messages);
      const reloadedPage: MessagePageRecord = {
        ...page,
        messageIds: incomingIds.length > 0 ? incomingIds : page.messageIds,
        status: 'Reloaded',
        lastAccessAt: Date.now(),
      };
      const window = markPageReloaded(
        readConversationWindow(state.messages, conversationId),
        reloadedPage,
      );
      recordWindowReload();
      logWindowEvent('reload', { conversationId, pageId: page.id });
      let nextState: ChatDomainState = {
        ...state,
        messages: {
          ...writeConversationWindow(state.messages, conversationId, window),
          byId: { ...byId, ...merge.byIdPatch },
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: merge.orderedIds,
          },
          versionByConversationId:
            merge.prepended > 0
              ? bumpMessageVersion(state, conversationId)
              : state.messages.versionByConversationId,
        },
      };
      nextState = applyWindowTrim(nextState, conversationId);
      return syncConversationPreviewFromMessages(nextState, conversationId);
    }

    case 'messages/trimWindow': {
      return applyWindowTrim(state, action.conversationId);
    }

    case 'messages/append': {
      const { conversationId, message } = action;
      const existingIds = state.messages.byConversationId[conversationId] ?? [];
      if (existingIds.includes(message.id)) return state;
      recordMessageAppend();
      const next: ChatDomainState = {
        ...state,
        messages: {
          ...state.messages,
          byId: { ...state.messages.byId, [message.id]: message },
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: [...existingIds, message.id],
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
      return syncConversationPreviewFromMessages(next, conversationId);
    }

    case 'messages/update': {
      const current = state.messages.byId[action.messageId];
      if (!current) return state;
      const next: ChatDomainState = {
        ...state,
        messages: {
          ...state.messages,
          byId: {
            ...state.messages.byId,
            [action.messageId]: { ...current, ...action.patch },
          },
          versionByConversationId: bumpMessageVersion(state, action.conversationId),
        },
      };
      return syncConversationPreviewFromMessages(next, action.conversationId);
    }

    case 'messages/remove': {
      const { conversationId, messageId } = action;
      if (!state.messages.byId[messageId]) return state;
      const nextById = { ...state.messages.byId };
      delete nextById[messageId];
      const ids = (state.messages.byConversationId[conversationId] ?? []).filter(
        (id) => id !== messageId,
      );
      const next: ChatDomainState = {
        ...state,
        messages: {
          ...state.messages,
          byId: nextById,
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: ids,
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
      return syncConversationPreviewFromMessages(next, conversationId);
    }

    case 'selection/setConversation': {
      if (state.selection.selectedConversationId === action.conversationId) {
        return state;
      }
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedConversationId: action.conversationId,
        },
      };
    }

    case 'loading/setConversations':
      return {
        ...state,
        loading: { ...state.loading, conversations: action.loading },
      };

    case 'loading/setMessages':
      return {
        ...state,
        loading: {
          ...state.loading,
          messages: {
            ...state.loading.messages,
            [action.conversationId]: action.loading,
          },
        },
      };

    case 'unread/set':
      return {
        ...state,
        unread: { ...state.unread, ...action.unread },
      };

    case 'connection/set':
      return {
        ...state,
        connection: { ...state.connection, ...action.connection },
      };

    case 'instances/set': {
      const byId = { ...state.instances.byId };
      const orderedIds: ChatInstanceId[] = [];
      const enabledIds: ChatInstanceId[] = [];
      for (const instance of action.instances) {
        byId[instance.id] = instance;
        orderedIds.push(instance.id);
        if (instance.enabledInChat) enabledIds.push(instance.id);
      }
      return {
        ...state,
        instances: { byId, orderedIds, enabledIds },
      };
    }

    case 'ui/patch':
      return {
        ...state,
        ui: { ...state.ui, ...action.ui },
      };

    case 'conversationVirtualization/setEnabled':
      if (state.conversationVirtualization.enabled === action.enabled) return state;
      return {
        ...state,
        conversationVirtualization: {
          ...state.conversationVirtualization,
          enabled: action.enabled,
        },
      };

    case 'conversationVirtualization/setWindow': {
      const prev = state.conversationVirtualization;
      const next = {
        ...prev,
        ...action.window,
        enabled: action.window.enabled ?? prev.enabled ?? true,
      };
      if (
        prev.enabled === next.enabled &&
        prev.visibleStart === next.visibleStart &&
        prev.visibleEnd === next.visibleEnd &&
        prev.overscanStart === next.overscanStart &&
        prev.overscanEnd === next.overscanEnd &&
        prev.scrollTop === next.scrollTop &&
        prev.viewportHeight === next.viewportHeight
      ) {
        return state;
      }
      return {
        ...state,
        conversationVirtualization: next,
      };
    }

    case 'messageVirtualization/setEnabled':
      if (state.messageVirtualization.enabled === action.enabled) return state;
      return {
        ...state,
        messageVirtualization: {
          ...state.messageVirtualization,
          enabled: action.enabled,
        },
      };

    case 'messageVirtualization/setWindow': {
      const prev = state.messageVirtualization;
      const next = {
        ...prev,
        ...action.window,
        enabled: action.window.enabled ?? prev.enabled ?? true,
      };
      if (
        prev.enabled === next.enabled &&
        prev.visibleStart === next.visibleStart &&
        prev.visibleEnd === next.visibleEnd &&
        prev.overscanStart === next.overscanStart &&
        prev.overscanEnd === next.overscanEnd &&
        prev.scrollTop === next.scrollTop &&
        prev.viewportHeight === next.viewportHeight &&
        prev.conversationId === next.conversationId
      ) {
        return state;
      }
      return {
        ...state,
        messageVirtualization: next,
      };
    }

    case 'hydrate/partial':
      return mergePartialState(state, action.state);

    case 'store/reset':
      return createInitialChatDomainState();

    case 'commands/begin': {
      const { token, command, conversationId, snapshot } = action;
      const pending = {
        id: token,
        name: command,
        conversationId,
        startedAt: Date.now(),
      };
      const change = {
        id: token,
        command,
        conversationId,
        createdAt: Date.now(),
      };
      const entry = {
        id: token,
        command,
        snapshot,
        createdAt: Date.now(),
      };
      const sending =
        command === 'sendMessage' && conversationId
          ? { ...state.loading.sending, [conversationId]: true }
          : state.loading.sending;
      return {
        ...state,
        commands: {
          ...state.commands,
          pendingCommands: { ...state.commands.pendingCommands, [token]: pending },
          optimisticChanges: { ...state.commands.optimisticChanges, [token]: change },
          rollbackStack: [...state.commands.rollbackStack, entry],
          commandVersion: state.commands.commandVersion + 1,
        },
        loading: sending !== state.loading.sending ? { ...state.loading, sending } : state.loading,
      };
    }

    case 'commands/confirm': {
      const { token } = action;
      const pending = state.commands.pendingCommands[token];
      const nextPending = { ...state.commands.pendingCommands };
      delete nextPending[token];
      const nextOptimistic = { ...state.commands.optimisticChanges };
      delete nextOptimistic[token];
      const nextStack = state.commands.rollbackStack.filter((e) => e.id !== token);
      const conversationId = pending?.conversationId;
      const sending =
        conversationId && state.loading.sending[conversationId]
          ? { ...state.loading.sending, [conversationId]: false }
          : state.loading.sending;
      return {
        ...state,
        commands: {
          ...state.commands,
          pendingCommands: nextPending,
          optimisticChanges: nextOptimistic,
          rollbackStack: nextStack,
          lastConfirmedVersion: state.commands.commandVersion,
        },
        loading: sending !== state.loading.sending ? { ...state.loading, sending } : state.loading,
      };
    }

    case 'commands/rollback': {
      const { token } = action;
      const entry = state.commands.rollbackStack.find((e) => e.id === token);
      const pending = state.commands.pendingCommands[token];
      const nextPending = { ...state.commands.pendingCommands };
      delete nextPending[token];
      const nextOptimistic = { ...state.commands.optimisticChanges };
      delete nextOptimistic[token];
      const nextStack = state.commands.rollbackStack.filter((e) => e.id !== token);
      const conversationId = pending?.conversationId;
      const restored = entry ? applyRollbackSnapshot(state, entry.snapshot) : state;
      const sending =
        conversationId && restored.loading.sending[conversationId]
          ? { ...restored.loading.sending, [conversationId]: false }
          : restored.loading.sending;
      return {
        ...restored,
        commands: {
          ...restored.commands,
          pendingCommands: nextPending,
          optimisticChanges: nextOptimistic,
          rollbackStack: nextStack,
          commandVersion: restored.commands.commandVersion + 1,
        },
        loading: sending !== restored.loading.sending ? { ...restored.loading, sending } : restored.loading,
      };
    }

    default:
      return state;
  }
}

function mergePartialState(
  state: ChatDomainState,
  partial: Partial<ChatDomainState>,
): ChatDomainState {
  return {
    conversations: partial.conversations
      ? { ...state.conversations, ...partial.conversations }
      : state.conversations,
    messages: partial.messages ? { ...state.messages, ...partial.messages } : state.messages,
    selection: partial.selection ? { ...state.selection, ...partial.selection } : state.selection,
    compose: partial.compose ? { ...state.compose, ...partial.compose } : state.compose,
    loading: partial.loading ? { ...state.loading, ...partial.loading } : state.loading,
    unread: partial.unread ? { ...state.unread, ...partial.unread } : state.unread,
    connection: partial.connection
      ? { ...state.connection, ...partial.connection }
      : state.connection,
    instances: partial.instances ? { ...state.instances, ...partial.instances } : state.instances,
    ui: partial.ui ? { ...state.ui, ...partial.ui } : state.ui,
    commands: partial.commands ? { ...state.commands, ...partial.commands } : state.commands,
    conversationVirtualization: partial.conversationVirtualization
      ? { ...state.conversationVirtualization, ...partial.conversationVirtualization }
      : state.conversationVirtualization,
    messageVirtualization: partial.messageVirtualization
      ? { ...state.messageVirtualization, ...partial.messageVirtualization }
      : state.messageVirtualization,
  };
}

/** Action creators tipados (contratos — não expostos à UI nesta sprint). */
export const chatDomainActionCreators = {
  setConversations(conversations: ChatDomainConversation[]) {
    return { type: 'conversations/set' as const, conversations };
  },
  upsertConversation(conversation: ChatDomainConversation) {
    return { type: 'conversations/upsert' as const, conversation };
  },
  removeConversation(conversationId: ChatConversationId) {
    return { type: 'conversations/remove' as const, conversationId };
  },
  setMessages(conversationId: ChatConversationId, messages: ChatDomainMessage[]) {
    return { type: 'messages/set' as const, conversationId, messages };
  },
  appendMessage(conversationId: ChatConversationId, message: ChatDomainMessage) {
    return { type: 'messages/append' as const, conversationId, message };
  },
  updateMessage(
    conversationId: ChatConversationId,
    messageId: ChatMessageId,
    patch: Partial<ChatDomainMessage>,
  ) {
    return { type: 'messages/update' as const, conversationId, messageId, patch };
  },
  removeMessage(conversationId: ChatConversationId, messageId: ChatMessageId) {
    return { type: 'messages/remove' as const, conversationId, messageId };
  },
  prependMessages(conversationId: ChatConversationId, messages: ChatDomainMessage[]) {
    return { type: 'messages/prepend' as const, conversationId, messages };
  },
  prependPage(
    conversationId: ChatConversationId,
    messages: ChatDomainMessage[],
    meta?: {
      nextCursor?: string | null;
      previousCursor?: string | null;
      hasMore?: boolean;
    },
  ) {
    return {
      type: 'messages/prependPage' as const,
      conversationId,
      messages,
      nextCursor: meta?.nextCursor,
      previousCursor: meta?.previousCursor,
      hasMore: meta?.hasMore,
    };
  },
  setMessageCursor(
    conversationId: ChatConversationId,
    cursorOrMeta:
      | string
      | null
      | {
          cursor?: string | null;
          nextCursor?: string | null;
          previousCursor?: string | null;
          hasMore?: boolean;
        },
  ) {
    if (cursorOrMeta !== null && typeof cursorOrMeta === 'object') {
      return {
        type: 'messages/setCursor' as const,
        conversationId,
        cursor: cursorOrMeta.cursor,
        nextCursor: cursorOrMeta.nextCursor ?? cursorOrMeta.cursor,
        previousCursor: cursorOrMeta.previousCursor,
        hasMore: cursorOrMeta.hasMore,
      };
    }
    return {
      type: 'messages/setCursor' as const,
      conversationId,
      cursor: cursorOrMeta,
      nextCursor: cursorOrMeta,
    };
  },
  setHasMore(conversationId: ChatConversationId, hasMore: boolean) {
    return { type: 'messages/setHasMore' as const, conversationId, hasMore };
  },
  setLoadingMore(conversationId: ChatConversationId, loading: boolean) {
    return { type: 'messages/setLoadingMore' as const, conversationId, loading };
  },
  resetCursor(conversationId: ChatConversationId) {
    return { type: 'messages/resetCursor' as const, conversationId };
  },
  registerPage(
    conversationId: ChatConversationId,
    page: MessagePageRecord,
    position?: 'older' | 'newer' | 'replace',
  ) {
    return {
      type: 'messages/registerPage' as const,
      conversationId,
      page,
      position,
    };
  },
  evictPage(conversationId: ChatConversationId, pageId: MessagePageId) {
    return { type: 'messages/evictPage' as const, conversationId, pageId };
  },
  updateWindow(
    conversationId: ChatConversationId,
    patch: {
      windowStart?: number;
      windowEnd?: number;
      pinnedPageIds?: MessagePageId[];
    },
  ) {
    return {
      type: 'messages/updateWindow' as const,
      conversationId,
      windowStart: patch.windowStart,
      windowEnd: patch.windowEnd,
      pinnedPageIds: patch.pinnedPageIds,
    };
  },
  rehydratePage(
    conversationId: ChatConversationId,
    page: MessagePageRecord,
    messages: ChatDomainMessage[],
  ) {
    return {
      type: 'messages/rehydratePage' as const,
      conversationId,
      page,
      messages,
    };
  },
  trimWindow(conversationId: ChatConversationId) {
    return { type: 'messages/trimWindow' as const, conversationId };
  },
  setLoadingMessages(conversationId: ChatConversationId, loading: boolean) {
    return { type: 'loading/setMessages' as const, conversationId, loading };
  },
  setSelectedConversation(conversationId: ChatConversationId | null) {
    return { type: 'selection/setConversation' as const, conversationId };
  },
  setLoadingConversations(loading: boolean) {
    return { type: 'loading/setConversations' as const, loading };
  },
  setUnread(unread: Partial<UnreadState>) {
    return { type: 'unread/set' as const, unread };
  },
  hydrate(state: Partial<ChatDomainState>) {
    return { type: 'hydrate/partial' as const, state };
  },
  reset() {
    return { type: 'store/reset' as const };
  },
  setConversationVirtualizationEnabled(enabled: boolean) {
    return { type: 'conversationVirtualization/setEnabled' as const, enabled };
  },
  setConversationVirtualWindow(window: Partial<ConversationVirtualizationState>) {
    return { type: 'conversationVirtualization/setWindow' as const, window };
  },
  setMessageVirtualizationEnabled(enabled: boolean) {
    return { type: 'messageVirtualization/setEnabled' as const, enabled };
  },
  setMessageVirtualWindow(window: Partial<MessageVirtualizationState>) {
    return { type: 'messageVirtualization/setWindow' as const, window };
  },
};
