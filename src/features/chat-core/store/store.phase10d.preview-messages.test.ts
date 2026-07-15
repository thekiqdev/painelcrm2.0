/**
 * Phase 10D — Preview deriva das Messages (Store).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
  syncStoreFromSocketEvent,
  selectChatConversationsForUi,
  selectChatMessagesForUi,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  getPreviewMessagesMetricsSnapshot,
  resetPreviewMessagesMetricsForTests,
} from '../metrics/previewMessagesMetrics';
import type { ChatDomainConversation, ChatDomainMessage } from '../domain/types';
import type { ChatMessage } from '@/services/chat';

const conversation = (id: string, preview?: string | null): ChatDomainConversation => ({
  id,
  instanceId: 'inst-1',
  channel: 'uazapi',
  unreadCount: 0,
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  lastMessagePreview: preview ?? 'stale-preview',
  contactName: 'Contact',
  phoneNumber: null,
  attendanceStatus: null,
  assignedToUserId: null,
  clientId: null,
  leadId: null,
  conversationType: 'direct',
});

const domainMsg = (
  id: string,
  conversationId: string,
  body: string,
  sentAt: string,
): ChatDomainMessage => ({
  id,
  conversationId,
  direction: 'incoming',
  body,
  status: 'delivered',
  sentAt,
  externalMessageId: null,
  clientMessageId: null,
});

const legacyMessage = (id: string, conversationId: string, body: string): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body,
    status: 'delivered',
    sent_at: '2026-07-15T12:00:00.000Z',
  }) as ChatMessage;

describe('Phase 10D preview ← messages', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    resetPreviewMessagesMetricsForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetPreviewMessagesMetricsForTests();
  });

  function session() {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    return store;
  }

  it('appendMessage rebuilds conversation preview from last message', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('c1')]));
    store.dispatch(
      chatDomainActionCreators.appendMessage(
        'c1',
        domainMsg('m1', 'c1', 'hello-thread', '2026-07-15T10:00:00.000Z'),
      ),
    );
    const row = store.getState().conversations.byId.c1;
    expect(row?.lastMessagePreview).toBe('hello-thread');
    expect(row?.lastMessageAt).toBe('2026-07-15T10:00:00.000Z');
    expect(getPreviewMessagesMetricsSnapshot().message_append_total).toBe(1);
    expect(getPreviewMessagesMetricsSnapshot().conversation_preview_rebuilt_total).toBeGreaterThan(0);
  });

  it('messages/set (hydrate) overwrites stale inbox preview', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setConversations([conversation('c1', 'preview-from-inbox')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        domainMsg('m1', 'c1', 'old', '2026-07-15T09:00:00.000Z'),
        domainMsg('m2', 'c1', 'latest-bubble', '2026-07-15T11:00:00.000Z'),
      ]),
    );
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('latest-bubble');
    expect(getPreviewMessagesMetricsSnapshot().preview_thread_divergence_total).toBeGreaterThan(0);
  });

  it('empty hydrate clears orphan preview', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setConversations([conversation('c1', 'orphan-preview')]),
    );
    store.dispatch(chatDomainActionCreators.setMessages('c1', []));
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBeNull();
    expect(store.getState().conversations.byId.c1?.lastMessageAt).toBeNull();
    expect(getPreviewMessagesMetricsSnapshot().preview_without_message_total).toBeGreaterThan(0);
  });

  it('TF3: hydrate last msg without sentAt preserves inbox lastMessageAt', () => {
    const store = session();
    const inboxAt = '2026-07-15T13:00:00.000Z';
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          ...conversation('c1', 'stale-preview'),
          lastMessageAt: inboxAt,
        },
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        {
          ...domainMsg('m1', 'c1', 'to contando os dias', '2026-07-15T12:00:00.000Z'),
          sentAt: null,
        },
      ]),
    );
    const row = store.getState().conversations.byId.c1;
    expect(row?.lastMessagePreview).toBe('to contando os dias');
    expect(row?.lastMessageAt).toBe(inboxAt);
  });

  it('TF3: hydrate with sentAt still updates lastMessageAt from thread', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          ...conversation('c1', 'old'),
          lastMessageAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        domainMsg('m1', 'c1', 'latest-bubble', '2026-07-15T11:00:00.000Z'),
      ]),
    );
    const row = store.getState().conversations.byId.c1;
    expect(row?.lastMessagePreview).toBe('latest-bubble');
    expect(row?.lastMessageAt).toBe('2026-07-15T11:00:00.000Z');
  });

  it('socket message.created updates preview via Message → Conversation', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('conv-1', 'old')]));
    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      payload: { message: legacyMessage('m9', 'conv-1', 'from-socket') },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'conv-1').map((m) => m.body)).toEqual([
      'from-socket',
    ]);
    expect(
      selectChatConversationsForUi(store.getState()).find((c) => c.id === 'conv-1')
        ?.lastMessagePreview,
    ).toBe('from-socket');
  });

  it('conversation.updated cannot override preview when thread is hydrated', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('conv-1', 'x')]));
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        domainMsg('m1', 'conv-1', 'thread-truth', '2026-07-15T12:00:00.000Z'),
      ]),
    );
    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        id: 'conv-1',
        last_message_preview: 'stale-from-conversation-event',
        last_message_at: '2026-07-15T13:00:00.000Z',
        unread_count: 3,
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    const row = selectChatConversationsForUi(store.getState()).find((c) => c.id === 'conv-1');
    expect(row?.lastMessagePreview).toBe('thread-truth');
    expect(row?.unreadCount).toBe(3);
  });

  it('conversation.updated may set preview when thread not hydrated yet', () => {
    const store = session();
    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        id: 'conv-1',
        last_message_preview: 'inbox-preview',
        last_message_at: '2026-07-15T12:00:00.000Z',
        unread_count: 1,
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(
      selectChatConversationsForUi(store.getState()).find((c) => c.id === 'conv-1')
        ?.lastMessagePreview,
    ).toBe('inbox-preview');
  });

  it('updateMessage on non-last does not steal preview from last bubble', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('c1', null)]));
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        domainMsg('m1', 'c1', 'first', '2026-07-15T10:00:00.000Z'),
        domainMsg('m2', 'c1', 'second', '2026-07-15T11:00:00.000Z'),
      ]),
    );
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('second');
    store.dispatch(
      chatDomainActionCreators.updateMessage('c1', 'm1', { status: 'read', body: 'edited-first' }),
    );
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('second');
  });

  it('updateMessage on last bubble refreshes preview', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('c1', null)]));
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        domainMsg('m1', 'c1', 'first', '2026-07-15T10:00:00.000Z'),
        domainMsg('m2', 'c1', 'second', '2026-07-15T11:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.updateMessage('c1', 'm2', { body: 'second-edited' }),
    );
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('second-edited');
  });

  it('equal sentAt prefers later array order (append tail)', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('c1', null)]));
    const at = '2026-07-08T12:00:00.000Z';
    store.dispatch(chatDomainActionCreators.setMessages('c1', [domainMsg('m1', 'c1', 'body-m1', at)]));
    store.dispatch(chatDomainActionCreators.appendMessage('c1', domainMsg('m2', 'c1', 'body-m2', at)));
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('body-m2');
    store.dispatch(
      chatDomainActionCreators.updateMessage('c1', 'm1', { status: 'read', body: 'updated' }),
    );
    expect(store.getState().conversations.byId.c1?.lastMessagePreview).toBe('body-m2');
  });
});
