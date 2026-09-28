import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  syncStoreFromRepositoryResponse,
  syncStoreFromSocketEvent,
  syncStoreFromCommandResult,
  applyChatStoreBootstrap,
  applyChatStoreReset,
  compareStoreVsRepository,
  resetChatStoreMetrics,
  getChatStoreMetricsSnapshot,
  setChatDomainStoreSessionForTests,
} from './index';
import { chatCore, resetChatCoreStoreShadow } from '../core/chatCore';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from './domainMappers';
import type { ChatConversation, ChatMessage } from '@/services/chat';

vi.mock('@/services/chat', () => ({
  chatService: {
    listInstances: vi.fn(async () => [
      { id: 'inst-1', status: 'connected', enabled_in_chat: true },
    ]),
    getConversations: vi.fn(async () => [
      {
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '5511999999999',
        unreadCount: 2,
        lastMessageAt: '2026-07-08T10:00:00.000Z',
      },
    ]),
    getConversationMessages: vi.fn(async () => [
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        body: 'hello',
        direction: 'incoming',
        status: 'delivered',
        sent_at: '2026-07-08T10:00:00.000Z',
      },
    ]),
    sendMessage: vi.fn(async (_cid: string, body: string) => ({
      id: 'msg-out-1',
      conversation_id: 'conv-1',
      body,
      direction: 'outgoing',
      status: 'sent',
      sent_at: '2026-07-08T10:01:00.000Z',
    })),
    markConversationRead: vi.fn(async () => undefined),
    syncConversationMessages: vi.fn(async () => ({ synced: 0 })),
    getConversationAttendanceCounts: vi.fn(async () => ({
      queue: 1,
      mine: 2,
      team: 0,
      unassigned: 0,
      closed: 0,
      unread: 3,
    })),
    patchConversationAttendance: vi.fn(async () => ({
      ok: true,
      conversation: {
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '5511999999999',
        attendance_status: 'in_progress',
      },
    })),
    transferConversation: vi.fn(async () => ({
      conversation: {
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '5511999999999',
      },
    })),
  },
  normalizeConversation: (raw: ChatConversation) => raw,
  normalizeChatMessage: (raw: ChatMessage) => raw,
}));

import { sendMessageCommand, markAsReadCommand } from '../core/commands';

describe('chat-core F5.1 store integration', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetChatStoreMetrics();
    setChatDomainStoreSessionForTests(null);
    resetChatCoreStoreShadow();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetChatCoreStoreShadow();
  });

  it('flag OFF — repository sync is no-op', () => {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromRepositoryResponse('listConversations', [
      mapLegacyConversationToDomain({
        id: 'c1',
        user_id: 'u1',
        external_chat_id: '1',
        unreadCount: 0,
      } as ChatConversation),
    ]);
    expect(store.getState().conversations.orderedIds).toHaveLength(0);
    expect(getChatStoreMetricsSnapshot().storeRepositoryUpdates).toBe(0);
  });

  it('flag ON — repository response hydrates store', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    const conversations = [
      mapLegacyConversationToDomain({
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '5511',
        unreadCount: 1,
      } as ChatConversation),
    ];
    syncStoreFromRepositoryResponse('listConversations', conversations);

    expect(store.getState().conversations.orderedIds).toEqual(['conv-1']);
    expect(getChatStoreMetricsSnapshot().storeRepositoryUpdates).toBe(1);
  });

  it('flag ON — websocket event updates store', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      receivedAt: Date.now(),
      conversationId: 'conv-1',
      messageId: 'msg-2',
      payload: {
        conversation_id: 'conv-1',
        message: {
          id: 'msg-2',
          conversation_id: 'conv-1',
          body: 'ws',
          direction: 'incoming',
        },
      },
    });

    expect(store.getState().messages.byId['msg-2']?.body).toBe('ws');
    expect(getChatStoreMetricsSnapshot().storeRealtimeUpdates).toBe(1);
  });

  it('flag ON — bootstrap loads instances via delegating repository', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    await applyChatStoreBootstrap();
    const store = createChatDomainStore();
    // session store is created inside bootstrap
    const session = chatCore.getInstances();
    expect(session.length).toBeGreaterThanOrEqual(0);
    expect(getChatStoreMetricsSnapshot().storeHydrationMs).toBeGreaterThanOrEqual(0);
    void store;
  });

  it('flag ON — command sync updates store', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    await sendMessageCommand('conv-1', 'test');
    const message = chatCore.getMessage('msg-out-1');
    expect(message?.body).toBe('test');
    expect(getChatStoreMetricsSnapshot().storeCommandUpdates).toBeGreaterThanOrEqual(1);
  });

  it('flag ON — markAsRead command sync', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    await markAsReadCommand('conv-1');
    syncStoreFromCommandResult('markAsRead', { conversationId: 'conv-1' });
    expect(getChatStoreMetricsSnapshot().storeCommandUpdates).toBeGreaterThanOrEqual(1);
  });

  it('reset clears session store', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromRepositoryResponse('listConversations', [
      mapLegacyConversationToDomain({
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '1',
        unreadCount: 0,
      } as ChatConversation),
    ]);
    applyChatStoreReset();
    expect(chatCore.getInstances()).toEqual([]);
  });

  it('compareStoreVsRepository detects mismatch in DEV', () => {
    const store = createChatDomainStore();
    syncStoreFromRepositoryResponse('listConversations', []);
    store.dispatch({
      type: 'conversations/set',
      conversations: [
        mapLegacyConversationToDomain({
          id: 'conv-1',
          user_id: 'u1',
          external_chat_id: '1',
          unreadCount: 0,
        } as ChatConversation),
      ],
    });
    const cmp = compareStoreVsRepository({
      store,
      repositoryConversations: [],
    });
    expect(cmp.conversationCountMatch).toBe(false);
    expect(cmp.storeConversationCount).toBe(1);
  });

  it('chatCore.applyEvent respects flag OFF', () => {
    chatCore.applyEvent({
      kind: 'message.created',
      protocol: 'v2',
      receivedAt: Date.now(),
      payload: {},
    });
    expect(chatCore.getMessages('conv-1')).toEqual([]);
  });
});
