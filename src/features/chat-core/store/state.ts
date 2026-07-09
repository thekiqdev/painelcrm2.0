/**
 * F5.0 — estado inicial do Domain Store.
 */

import type { ChatDomainState } from './types';
import { createInitialCommandState } from './commandState';

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
  };
}
