import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { applyStoreConversationList } from './consolidation';
import {
  createChatDomainStore,
  syncStoreFromCommandResult,
  chatDomainActionCreators,
  selectChatConversationsForUi,
  selectChatMessagesForUi,
  selectConversationCount,
  selectConversationOrder,
  selectChatConversationLoading,
  selectMessageLoading,
  selectSelectedConversationForUi,
  selectCurrentConversation,
  recordChatConversationRender,
  recordChatMessagesRender,
  resetChatPrincipalMetrics,
  getChatPrincipalMetricsSnapshot,
  setChatDomainStoreSessionForTests,
  shouldUseChatDomainStore,
  getChatDomainStoreSession,
} from './index';
import {
  compareChatConversationParity,
  compareChatMessagesParity,
} from './chatShadowValidation';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyMessageToDomain } from './domainMappers';
import type { ChatConversation, ChatMessage } from '@/services/chat';

const legacyConversation = (id: string): ChatConversation =>
  ({
    id,
    user_id: 'u1',
    external_chat_id: `55${id}`,
    unread_count: 1,
    unreadCount: 1,
    lastMessageAt: '2026-07-08T10:00:00.000Z',
  }) as ChatConversation;

const legacyMessage = (id: string, conversationId: string): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body: `body-${id}`,
    status: 'delivered',
    sent_at: '2026-07-08T10:00:00.000Z',
  }) as ChatMessage;

describe('chat-core F5.4 chat principal read-only', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetChatPrincipalMetrics();
    setChatDomainStoreSessionForTests(null);
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetChatPrincipalMetrics();
  });

  it('conversation selectors expose count, order and current conversation', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    applyStoreConversationList([
      legacyConversation('c1'),
      legacyConversation('c2'),
    ]);
    store.dispatch(chatDomainActionCreators.setSelectedConversation('c1'));

    const state = store.getState();
    expect(selectConversationCount(state)).toBe(2);
    expect(selectConversationOrder(state)).toEqual(['c1', 'c2']);
    expect(selectCurrentConversation(state, 'c1')?.id).toBe('c1');
    expect(selectSelectedConversationForUi(state)?.id).toBe('c1');
    expect(selectChatConversationsForUi(state).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('message selectors expose list and loading', () => {
    const store = createChatDomainStore();
    const rows = [legacyMessage('m1', 'c1'), legacyMessage('m2', 'c1')].map(
      mapLegacyMessageToDomain,
    );
    store.dispatch(chatDomainActionCreators.setMessages('c1', rows));
    store.dispatch(chatDomainActionCreators.setLoadingMessages('c1', true));

    const state = store.getState();
    expect(selectChatMessagesForUi(state, 'c1').map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(selectMessageLoading(state, 'c1')).toBe(true);
    expect(selectChatConversationLoading(state, 'c1')).toBe(true);
  });

  it('switches selected conversation in store', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    applyStoreConversationList([
      legacyConversation('c1'),
      legacyConversation('c2'),
    ]);
    store.dispatch(chatDomainActionCreators.setSelectedConversation('c1'));
    expect(selectCurrentConversation(store.getState(), 'c1')?.id).toBe('c1');

    store.dispatch(chatDomainActionCreators.setSelectedConversation('c2'));
    expect(selectCurrentConversation(store.getState(), 'c2')?.id).toBe('c2');
  });

  it('hydrates messages from repository sync', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromCommandResult('listMessages', [
      legacyMessage('m1', 'conv-1'),
      legacyMessage('m2', 'conv-1'),
    ]);
    expect(selectChatMessagesForUi(store.getState(), 'conv-1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('compareChatConversationParity validates list parity', () => {
    const repository = [legacyConversation('a'), legacyConversation('b')];
    const store = [legacyConversation('a'), legacyConversation('b')];
    const ok = compareChatConversationParity({
      repositoryConversations: repository,
      storeConversations: store,
      selectedConversationId: 'a',
      storeSelectedConversationId: 'a',
      repositoryLoading: false,
      storeLoading: false,
    });
    expect(ok.parity).toBe(true);
  });

  it('compareChatMessagesParity validates message parity', () => {
    const repository = [legacyMessage('m1', 'c1'), legacyMessage('m2', 'c1')];
    const store = [legacyMessage('m1', 'c1'), legacyMessage('m2', 'c1')];
    const ok = compareChatMessagesParity({
      repositoryMessages: repository,
      storeMessages: store,
      repositoryLoading: false,
      storeLoading: false,
    });
    expect(ok.parity).toBe(true);
  });

  it('records chat principal metrics when CHAT_CORE_METRICS is on', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    recordChatConversationRender({ source: 'store', durationMs: 5 });
    recordChatMessagesRender({ source: 'store', durationMs: 7 });
    expect(getChatPrincipalMetricsSnapshot()).toMatchObject({
      chatConversationRenderSource: 'store',
      chatConversationRenderMs: 5,
      chatMessagesRenderSource: 'store',
      chatMessagesRenderMs: 7,
    });
  });

  it('feature flag OFF disables domain store session', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
    expect(getChatDomainStoreSession()).toBeNull();
  });

  it('feature flag ON enables store reads for chat principal', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const session = getChatDomainStoreSession();
    expect(session).not.toBeNull();
    setChatDomainStoreSessionForTests(session);
    applyStoreConversationList([legacyConversation('c1')]);
    expect(selectChatConversationsForUi(session!.getState()).map((c) => c.id)).toEqual(['c1']);
  });
});
