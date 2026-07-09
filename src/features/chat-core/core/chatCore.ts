/**
 * Orquestração Chat Core — F5.1 shadow Domain Store.
 *
 * Com CHAT_CORE_STORE OFF: comportamento idêntico ao stub F0 (selectors vazios).
 * Com CHAT_CORE_STORE ON: sincroniza Domain Store em paralelo; UI não consome.
 */

import type { ChatCorePublicApi } from '../domain/public-api';
import type {
  ChatAttendanceCounts,
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainEvent,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatInboxScope,
  ChatInstanceId,
  ChatMessageId,
} from '../domain/types';
import { delegatingChatRepository } from '../repository/delegatingChatRepository';
import { chatRepository } from '../repository/chatRepository';
import { chatRealtimeBridge } from '../realtime/bridge';
import { announceChatCoreFoundationReady } from '../metrics/baseline';
import { isChatPhaseFlagEnabled } from '../feature-flags';
import {
  loadInboxCommand,
  loadMessagesCommand,
  markAsReadCommand,
  sendMessageCommand,
  chatCoreCommands,
} from './commands';
import {
  applyChatStoreBootstrap,
  applyChatStoreReset,
  syncStoreFromRepositoryResponse,
  syncStoreFromSocketEvent,
} from '../store/integration';
import { getChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';

const emptyCounts: ChatAttendanceCounts = {
  queue: 0,
  mine: 0,
  team: 0,
  unassigned: 0,
  closed: 0,
  unread: 0,
};

function shadowEnabled(): boolean {
  return isChatPhaseFlagEnabled('CHAT_CORE_STORE') && shouldUseChatDomainStore();
}

function repo() {
  return shadowEnabled() ? delegatingChatRepository : chatRepository;
}

function readFromStore<T>(reader: (state: ReturnType<NonNullable<ReturnType<typeof getChatDomainStoreSession>>['getState']>) => T, fallback: T): T {
  const store = getChatDomainStoreSession();
  if (!store) return fallback;
  return reader(store.getState());
}

export const chatCore: ChatCorePublicApi = {
  phase: 'F5.10',
  get isWired() {
    return shadowEnabled();
  },

  commands: chatCoreCommands,

  async loadInstances() {
    const rows = await repo().listInstances();
    if (shadowEnabled()) {
      syncStoreFromRepositoryResponse('listInstances', rows);
    }
    return rows;
  },

  async loadInbox(params: {
    instanceIds: ChatInstanceId[];
    inboxScope: ChatInboxScope;
    surface?: import('../core/loadInbox').LoadInboxSurface;
    quickFilter?: 'all' | 'mine' | 'unread';
    attendanceFilter?: '' | 'mine' | 'queue' | 'team' | 'closed';
    channelOrigin?: 'all' | 'uazapi' | 'official';
    conversationFilter?: 'groups';
    includeOfficialWhenAll?: boolean;
    allowEmpty?: boolean;
  }) {
    if (shadowEnabled()) {
      const result = await loadInboxCommand(params);
      return result.domain;
    }
    return repo().getConversations({
      instanceIds: params.instanceIds,
      inboxScope: params.inboxScope,
      attendanceFilter:
        params.attendanceFilter === 'mine' || params.quickFilter === 'mine'
          ? 'mine'
          : params.attendanceFilter || undefined,
    });
  },

  async loadMessages(conversationId) {
    if (shadowEnabled()) {
      return loadMessagesCommand(conversationId);
    }
    return repo().getMessages(conversationId);
  },

  async markRead(conversationId) {
    if (shadowEnabled()) {
      await markAsReadCommand(conversationId);
      return;
    }
    return repo().markConversationRead(conversationId);
  },

  async sendText(conversationId, body) {
    if (shadowEnabled()) {
      return sendMessageCommand(conversationId, body);
    }
    return repo().sendText(conversationId, body);
  },

  async syncMessages(conversationId) {
    await repo().syncMessages(conversationId);
    if (shadowEnabled()) {
      await loadMessagesCommand(conversationId);
    }
  },

  async reconcileAttendanceCounts(params) {
    const counts = await repo().getAttendanceCounts(params);
    if (shadowEnabled()) {
      syncStoreFromRepositoryResponse('attendanceCounts', counts);
    }
    return counts;
  },

  getConversation(id) {
    return readFromStore(
      (state) => getChatDomainStoreSession()?.selectors.selectConversation(state, id) ?? null,
      null,
    );
  },

  getMessages(conversationId) {
    return readFromStore(
      (state) =>
        getChatDomainStoreSession()?.selectors.selectMessages(state, conversationId) ?? [],
      [],
    );
  },

  getInstances() {
    return readFromStore(
      (state) => getChatDomainStoreSession()?.selectors.selectInstances(state) ?? [],
      [],
    );
  },

  getAttendanceCounts() {
    return readFromStore((state) => state.unread.attendance, emptyCounts);
  },

  getMessage(id) {
    return readFromStore((state) => state.messages.byId[id] ?? null, null);
  },

  applyEvent(event: ChatDomainEvent): void {
    if (!shadowEnabled()) return;
    syncStoreFromSocketEvent(event);
  },
};

export const conversationStorePlaceholder = {
  name: 'ConversationStore' as const,
  get wired() {
    return shadowEnabled();
  },
};

export const messageStorePlaceholder = {
  name: 'MessageStore' as const,
  get wired() {
    return shadowEnabled();
  },
};

export const instanceRegistryPlaceholder = {
  name: 'InstanceRegistry' as const,
  wired: false,
};

export const unreadEnginePlaceholder = {
  name: 'UnreadEngine' as const,
  wired: false,
};

export function bootstrapChatCoreFoundation(): void {
  announceChatCoreFoundationReady();
  void chatRealtimeBridge;
  void chatCore;
}

export async function bootstrapChatCoreStoreShadow(
  params: Parameters<typeof applyChatStoreBootstrap>[0] = {},
): Promise<void> {
  await applyChatStoreBootstrap(params);
}

export function resetChatCoreStoreShadow(): void {
  applyChatStoreReset();
}
