import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  applyStoreConversationList,
  applyStoreMessages,
  isChatStoreSourceOfTruth,
  setStoreLoadingConversations,
  getConsolidatedMetricsSnapshot,
  resetConsolidatedMetrics,
  selectChatConversationsForUi,
  selectChatMessagesForUi,
  setChatDomainStoreSessionForTests,
  shouldUseChatDomainStore,
} from './index';
import { sendMessageCommand, markConversationReadCommand } from '../core/commands';
import { syncStoreFromSocketEvent } from './integration';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatConversation, ChatMessage } from '@/services/chat';

vi.mock('@/services/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat')>();
  return {
    ...actual,
    chatService: {
      ...actual.chatService,
      sendMessage: vi.fn(async (_cid: string, body: string) => ({
        message: {
          id: 'msg-1',
          conversation_id: 'c1',
          body,
          direction: 'outgoing',
          status: 'sent',
          sent_at: '2026-07-08T10:01:00.000Z',
        },
      })),
      markConversationRead: vi.fn(async () => undefined),
    },
  };
});

const legacyConversation = (id: string): ChatConversation =>
  ({
    id,
    user_id: 'u1',
    external_chat_id: `55${id}`,
    unreadCount: 1,
    lastMessageAt: '2026-07-08T10:00:00.000Z',
  }) as ChatConversation;

const legacyMessage = (id: string): ChatMessage =>
  ({
    id,
    conversation_id: 'c1',
    direction: 'incoming',
    body: 'hello',
    status: 'delivered',
    sent_at: '2026-07-08T10:00:00.000Z',
  }) as ChatMessage;

function session() {
  const store = getChatDomainStoreSession();
  if (!store) throw new Error('store missing');
  return store;
}

describe('chat-core F5.6 consolidation', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetConsolidatedMetrics();
    setChatDomainStoreSessionForTests(null);
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetConsolidatedMetrics();
  });

  it('isChatStoreSourceOfTruth reflects feature flag', () => {
    expect(isChatStoreSourceOfTruth()).toBe(true);
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(isChatStoreSourceOfTruth()).toBe(false);
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('applyStoreConversationList is the sole write path for conversations', () => {
    applyStoreConversationList([legacyConversation('c1'), legacyConversation('c2')]);
    expect(selectChatConversationsForUi(session().getState()).map((c) => c.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(getConsolidatedMetricsSnapshot().storeUpdates).toBeGreaterThanOrEqual(1);
  });

  it('applyStoreMessages writes messages to store', () => {
    applyStoreMessages('c1', [legacyMessage('m1'), legacyMessage('m2')]);
    expect(selectChatMessagesForUi(session().getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('commands update store directly', async () => {
    applyStoreConversationList([legacyConversation('c1')]);
    await markConversationReadCommand('c1');
    expect(session().getState().conversations.byId['c1']?.unreadCount).toBe(0);
  });

  it('socket events update store directly', () => {
    applyStoreConversationList([legacyConversation('c1')]);
    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      receivedAt: Date.now(),
      conversationId: 'c1',
      payload: legacyConversation('c1'),
    });
    expect(selectChatConversationsForUi(session().getState()).length).toBe(1);
  });

  it('sendMessage command updates store as single source of truth', async () => {
    applyStoreConversationList([legacyConversation('c1')]);
    await sendMessageCommand('c1', 'test');
    const ids = session().getState().messages.byConversationId['c1'] ?? [];
    expect(
      ids.some((id) => session().getState().messages.byId[id]?.body === 'test'),
    ).toBe(true);
  });

  it('loading flags live in domain store', () => {
    setStoreLoadingConversations(true);
    expect(session().getState().loading.conversations).toBe(true);
    setStoreLoadingConversations(false);
    expect(session().getState().loading.conversations).toBe(false);
  });

  it('feature flag OFF blocks store writes (legacy rollback path)', () => {
    const store = session();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    applyStoreConversationList([legacyConversation('c1')]);
    expect(store.getState().conversations.orderedIds).toEqual([]);
  });
});
