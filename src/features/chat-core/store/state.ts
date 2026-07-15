/**
 * F5.0 — estado inicial do Domain Store.
 */

import type { ChatDomainState } from './types';
import { createInitialCommandState } from './commandState';
import { createInitialConversationVirtualizationState } from './conversationVirtualizationState';
import { createInitialMessageVirtualizationState } from './messageVirtualizationState';

export function createInitialChatDomainState(): ChatDomainState {
  return {
    conversations: {
      byId: {},
      orderedIds: [],
      inboxScope: null,
      instanceIds: [],
      lastHydratedAt: null,
    },
    messages: {
      byConversationId: {},
      byId: {},
      versionByConversationId: {},
      lastLoadedCursorByConversationId: {},
      cursorByConversationId: {},
      hasMoreByConversationId: {},
      loadingMoreByConversationId: {},
      nextCursorByConversationId: {},
      previousCursorByConversationId: {},
      loadedPagesByConversationId: {},
      residentPagesByConversationId: {},
      windowStartByConversationId: {},
      windowEndByConversationId: {},
      cachedPagesByConversationId: {},
      evictedPagesByConversationId: {},
      memoryFootprintByConversationId: {},
    },
    selection: {
      selectedConversationId: null,
      selectedInstanceIds: [],
    },
    compose: {
      draftByConversationId: {},
    },
    loading: {
      conversations: false,
      messages: {},
      instances: false,
      sending: {},
    },
    unread: {
      global: 0,
      byConversationId: {},
      attendance: null,
      lastReconciledAt: null,
    },
    connection: {
      status: 'idle',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
    },
    instances: {
      byId: {},
      orderedIds: [],
      enabledIds: [],
    },
    ui: {
      inboxFilter: null,
      searchTerm: null,
      channelOrigin: null,
      conversationFilter: null,
    },
    commands: createInitialCommandState(),
    conversationVirtualization: createInitialConversationVirtualizationState(),
    messageVirtualization: createInitialMessageVirtualizationState(),
  };
}

/**
 * Snapshot vazio imutável para getSnapshot / SSR.
 * Nunca use createInitialChatDomainState() em useSyncExternalStore — aloca
 * objeto novo a cada chamada e causa "Maximum update depth exceeded".
 */
export const EMPTY_CHAT_DOMAIN_STATE: ChatDomainState = createInitialChatDomainState();
