import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  createInitialChatDomainState,
  chatDomainActionCreators,
  chatDomainSelectors,
  shouldUseChatDomainStore,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation, ChatDomainMessage } from '../domain/types';

const conversation = (id: string): ChatDomainConversation => ({
  id,
  instanceId: 'inst-1',
  channel: 'uazapi',
  unreadCount: 0,
  lastMessageAt: null,
  lastMessagePreview: null,
  contactName: `Contact ${id}`,
  phoneNumber: null,
  attendanceStatus: null,
  assignedToUserId: null,
  clientId: null,
  leadId: null,
  conversationType: 'direct',
});

const message = (id: string, conversationId: string): ChatDomainMessage => ({
  id,
  conversationId,
  direction: 'incoming',
  body: `body-${id}`,
  status: 'delivered',
  sentAt: '2026-07-08T12:00:00.000Z',
  externalMessageId: null,
  clientMessageId: null,
});

describe('chat-core F5.0 domain store', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  it('creates an isolated store instance (no singleton)', () => {
    const a = createChatDomainStore();
    const b = createChatDomainStore();
    a.dispatch(chatDomainActionCreators.setUnread({ global: 5 }));
    expect(a.getState().unread.global).toBe(5);
    expect(b.getState().unread.global).toBe(0);
  });

  it('starts with empty initial state', () => {
    const store = createChatDomainStore();
    const state = store.getState();
    expect(state.conversations.orderedIds).toEqual([]);
    expect(state.messages.byId).toEqual({});
    expect(state.selection.selectedConversationId).toBeNull();
    expect(state.connection.status).toBe('idle');
    expect(state.loading.conversations).toBe(false);
  });

  it('createInitialChatDomainState matches factory default', () => {
    const store = createChatDomainStore();
    const manual = createInitialChatDomainState();
    expect(store.getState()).toEqual(manual);
  });

  it('selectors return pure views of state', () => {
    const store = createChatDomainStore();
    const c1 = conversation('c1');
    store.dispatch(chatDomainActionCreators.setConversations([c1]));
    store.dispatch(chatDomainActionCreators.setSelectedConversation('c1'));

    const state = store.getState();
    expect(chatDomainSelectors.selectConversation(state, 'c1')).toEqual(c1);
    expect(chatDomainSelectors.selectConversations(state)).toHaveLength(1);
    expect(chatDomainSelectors.selectSelectedConversation(state)?.id).toBe('c1');
    expect(chatDomainSelectors.selectLoadingConversations(state)).toBe(false);
  });

  it('supports basic conversation and message actions', () => {
    const store = createChatDomainStore();
    const c1 = conversation('c1');
    const m1 = message('m1', 'c1');
    const m2 = message('m2', 'c1');

    store.dispatch(chatDomainActionCreators.setConversations([c1]));
    store.dispatch(chatDomainActionCreators.setMessages('c1', [m1]));
    store.dispatch(chatDomainActionCreators.appendMessage('c1', m2));
    store.dispatch(
      chatDomainActionCreators.updateMessage('c1', 'm1', { status: 'read', body: 'updated' }),
    );

    const messages = chatDomainSelectors.selectMessages(store.getState(), 'c1');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.body).toBe('updated');
    expect(messages[0]?.status).toBe('read');

    store.dispatch(chatDomainActionCreators.removeMessage('c1', 'm2'));
    expect(chatDomainSelectors.selectMessages(store.getState(), 'c1')).toHaveLength(1);
  });

  it('notifies subscribers on dispatch and allows unsubscribe', () => {
    const store = createChatDomainStore();
    const seen: number[] = [];
    const unsub = store.subscribe((state) => {
      seen.push(state.unread.global);
    });

    store.dispatch(chatDomainActionCreators.setUnread({ global: 1 }));
    store.dispatch(chatDomainActionCreators.setUnread({ global: 2 }));
    expect(seen).toEqual([1, 2]);

    unsub();
    store.dispatch(chatDomainActionCreators.setUnread({ global: 3 }));
    expect(seen).toEqual([1, 2]);
  });

  it('hydration stub accepts dispatch without throwing', () => {
    const store = createChatDomainStore();
    expect(() => store.hydration.hydrateFromRepository({ items: [] })).not.toThrow();
    expect(() => store.hydration.markHydrated('conversations')).not.toThrow();
  });

  it('persistence stub returns null and does not throw on save', () => {
    const store = createChatDomainStore();
    expect(store.persistence.loadDraft('c1')).toBeNull();
    expect(store.persistence.loadSelection()).toBeNull();
    expect(store.persistence.loadScroll('c1')).toBeNull();
    expect(store.persistence.loadFilters()).toBeNull();
    expect(() => store.persistence.saveDraft('c1', 'draft')).not.toThrow();
  });

  it('event bus stubs do not throw', () => {
    const store = createChatDomainStore();
    expect(() =>
      store.events.applySocketEvent({
        kind: 'message.created',
        protocol: 'v2',
        receivedAt: Date.now(),
        conversationId: 'c1',
        messageId: 'm1',
        payload: {},
      }),
    ).not.toThrow();
    expect(() => store.events.applyRepositoryResponse('inbox', [])).not.toThrow();
    expect(() => store.events.applyCommandResult('sendText', {})).not.toThrow();
    expect(() => store.events.applyReconnect()).not.toThrow();
  });

  it('reset restores initial state', () => {
    const store = createChatDomainStore();
    store.dispatch(chatDomainActionCreators.setConversations([conversation('c1')]));
    store.dispatch(chatDomainActionCreators.setUnread({ global: 9 }));
    store.reset();
    expect(store.getState()).toEqual(createInitialChatDomainState());
  });

  it('CHAT_CORE_STORE defaults OFF via flag manager', () => {
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('CHAT_CORE_STORE reads panel flag when enabled', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    expect(shouldUseChatDomainStore()).toBe(true);
  });
});
