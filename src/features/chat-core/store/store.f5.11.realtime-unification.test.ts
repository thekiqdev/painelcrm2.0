/**
 * F5.11 — Realtime Unification (Bridge → Domain Store).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  syncStoreFromSocketEvent,
  selectChatMessagesForUi,
  selectChatConversationsForUi,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { isChatStoreRealtimeSourceOfTruth } from '../realtime/policy';
import { mapDomainEventToActions } from './eventAppliers';
import type { ChatMessage } from '@/services/chat';

const legacyMessage = (id: string, conversationId: string): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body: `body-${id}`,
    status: 'delivered',
    sent_at: '2026-07-09T12:00:00.000Z',
  }) as ChatMessage;

describe('F5.11 realtime unification', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  function session() {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    return store;
  }

  it('isChatStoreRealtimeSourceOfTruth follows CHAT_CORE_STORE', () => {
    expect(isChatStoreRealtimeSourceOfTruth()).toBe(true);
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(isChatStoreRealtimeSourceOfTruth()).toBe(false);
  });

  it('message.created appends to store', () => {
    const store = session();
    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      payload: { message: legacyMessage('m1', 'conv-1') },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'conv-1').map((m) => m.id)).toEqual(['m1']);
  });

  it('message.updated patches store', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        {
          id: 'm1',
          conversationId: 'conv-1',
          direction: 'outgoing',
          body: 'hi',
          status: 'sent',
          sentAt: '2026-07-09T12:00:00.000Z',
          externalMessageId: null,
          clientMessageId: null,
        },
      ]),
    );
    syncStoreFromSocketEvent({
      kind: 'message.updated',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'conv-1') },
      conversationId: 'conv-1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'conv-1')[0]?.status).toBe('delivered');
  });

  it('message.deleted removes from store', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        {
          id: 'm1',
          conversationId: 'conv-1',
          direction: 'incoming',
          body: 'x',
          status: 'delivered',
          sentAt: null,
          externalMessageId: null,
          clientMessageId: null,
        },
        {
          id: 'm2',
          conversationId: 'conv-1',
          direction: 'incoming',
          body: 'y',
          status: 'delivered',
          sentAt: null,
          externalMessageId: null,
          clientMessageId: null,
        },
      ]),
    );
    syncStoreFromSocketEvent({
      kind: 'message.deleted',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'conv-1') },
      conversationId: 'conv-1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'conv-1').map((m) => m.id)).toEqual(['m2']);
  });

  it('conversation.updated upserts store', () => {
    const store = session();
    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        id: 'conv-1',
        last_message_preview: 'hello',
        last_message_at: '2026-07-09T12:00:00.000Z',
        unread_count: 2,
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    const row = selectChatConversationsForUi(store.getState()).find((c) => c.id === 'conv-1');
    expect(row?.lastMessagePreview).toBe('hello');
  });

  it('conversation.deleted removes from store', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          id: 'conv-1',
          instanceId: null,
          channel: 'uazapi',
          unreadCount: 0,
          lastMessageAt: null,
          lastMessagePreview: null,
          contactName: null,
          phoneNumber: null,
          attendanceStatus: null,
          assignedToUserId: null,
          clientId: null,
          leadId: null,
          conversationType: null,
        },
      ]),
    );
    syncStoreFromSocketEvent({
      kind: 'conversation.deleted',
      protocol: 'v2',
      payload: { conversation_id: 'conv-1' },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(selectChatConversationsForUi(store.getState()).some((c) => c.id === 'conv-1')).toBe(false);
  });

  it('conversation.attendance_updated upserts store', () => {
    const store = createChatDomainStore();
    const actions = mapDomainEventToActions({
      kind: 'conversation.attendance_updated',
      protocol: 'normalized',
      payload: {
        conversation: {
          id: 'conv-1',
          attendance_status: 'in_progress',
          assigned_to_user_id: 'user-1',
        },
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(actions).toHaveLength(1);
    for (const action of actions) store.dispatch(action);
    const row = store.getState().conversations.byId['conv-1'];
    expect(row?.attendanceStatus).toBe('in_progress');
  });

  it('message.read maps to read status', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        {
          id: 'm1',
          conversationId: 'conv-1',
          direction: 'outgoing',
          body: 'hi',
          status: 'delivered',
          sentAt: null,
          externalMessageId: null,
          clientMessageId: null,
        },
      ]),
    );
    syncStoreFromSocketEvent({
      kind: 'message.read',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'conv-1') },
      conversationId: 'conv-1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'conv-1')[0]?.status).toBe('read');
  });
});
