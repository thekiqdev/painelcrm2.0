import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  syncStoreFromCommandResult,
  syncStoreFromSocketEvent,
  selectMessage,
  selectConversationMessages,
  selectMessages,
  selectLastMessage,
  selectMessageCount,
  selectMessageLoading,
  selectMessagesForUi,
  sortDomainMessages,
  applyFloatingMessagesUpdater,
  recordFloatingMessageRender,
  resetFloatingMessageMetrics,
  getFloatingMessageMetricsSnapshot,
  setChatDomainStoreSessionForTests,
  shouldUseChatDomainStore,
  getChatDomainStoreSession,
  chatDomainActionCreators,
} from './index';
import { compareFloatingMessageParity } from './shadowValidation';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyMessageToDomain } from './domainMappers';
import { mapDomainEventToActions } from './eventAppliers';
import type { ChatMessage } from '@/services/chat';
import type { ChatDomainMessage } from '../domain/types';

const { legacyMessage } = vi.hoisted(() => {
  const fn = (
    id: string,
    conversationId: string,
    patch: Partial<ChatMessage> = {},
  ): ChatMessage =>
    ({
      id,
      conversation_id: conversationId,
      direction: 'incoming',
      body: `body-${id}`,
      status: 'delivered',
      sent_at: `2026-07-08T10:0${id.slice(-1)}:00.000Z`,
      ...patch,
    }) as ChatMessage;
  return { legacyMessage: fn };
});

const domainFromLegacy = (raw: ChatMessage): ChatDomainMessage => mapLegacyMessageToDomain(raw);

vi.mock('@/services/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat')>();
  return {
    ...actual,
    chatService: {
      getConversationMessages: vi.fn(async () => [
        legacyMessage('msg-1', 'conv-1'),
        legacyMessage('msg-2', 'conv-1'),
      ]),
      syncConversationMessages: vi.fn(async () => ({ synced: 0 })),
    },
    normalizeChatMessage: (raw: ChatMessage) => raw,
    normalizeConversation: actual.normalizeConversation,
  };
});

describe('chat-core F5.3 floating messages', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetFloatingMessageMetrics();
    setChatDomainStoreSessionForTests(null);
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetFloatingMessageMetrics();
  });

  it('message selectors expose list, count, last and loading', () => {
    const store = createChatDomainStore();
    const rows = [
      domainFromLegacy(legacyMessage('m1', 'c1', { sent_at: '2026-07-08T10:01:00.000Z' })),
      domainFromLegacy(legacyMessage('m2', 'c1', { sent_at: '2026-07-08T10:02:00.000Z' })),
    ];
    store.dispatch(chatDomainActionCreators.setMessages('c1', rows));

    const state = store.getState();
    expect(selectMessage(state, 'm1')?.id).toBe('m1');
    expect(selectMessageCount(state, 'c1')).toBe(2);
    expect(selectMessages(state, 'c1').map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(selectLastMessage(state, 'c1')?.id).toBe('m2');
    expect(selectMessagesForUi(state, 'c1').map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(selectMessageLoading(state, 'c1')).toBe(false);
  });

  it('sortDomainMessages orders by sentAt ascending', () => {
    const ordered = sortDomainMessages([
      domainFromLegacy(legacyMessage('b', 'c1', { sent_at: '2026-07-08T10:02:00.000Z' })),
      domainFromLegacy(legacyMessage('a', 'c1', { sent_at: '2026-07-08T10:01:00.000Z' })),
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('appends message on realtime message.created', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromCommandResult('listMessages', [legacyMessage('m1', 'conv-1')]);

    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      payload: { message: legacyMessage('m2', 'conv-1') },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });

    expect(selectMessageCount(store.getState(), 'conv-1')).toBe(2);
  });

  it('updates message status on message.delivered', () => {
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        domainFromLegacy(legacyMessage('m1', 'conv-1', { status: 'sent' })),
      ]),
    );

    const actions = mapDomainEventToActions({
      kind: 'message.delivered',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'conv-1', { status: 'delivered' }) },
      conversationId: 'conv-1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    for (const action of actions) store.dispatch(action);

    expect(selectMessage(store.getState(), 'm1')?.status).toBe('delivered');
  });

  it('removes message on message.deleted', () => {
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        domainFromLegacy(legacyMessage('m1', 'conv-1')),
        domainFromLegacy(legacyMessage('m2', 'conv-1')),
      ]),
    );

    const actions = mapDomainEventToActions({
      kind: 'message.deleted',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'conv-1') },
      conversationId: 'conv-1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    for (const action of actions) store.dispatch(action);

    expect(selectMessageCount(store.getState(), 'conv-1')).toBe(1);
    expect(selectMessages(store.getState(), 'conv-1').map((m) => m.id)).toEqual(['m2']);
  });

  it('prepends history messages preserving order', () => {
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setMessages('conv-1', [
        domainFromLegacy(legacyMessage('m2', 'conv-1', { sent_at: '2026-07-08T10:02:00.000Z' })),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.prependMessages('conv-1', [
        domainFromLegacy(legacyMessage('m1', 'conv-1', { sent_at: '2026-07-08T10:01:00.000Z' })),
      ]),
    );
    expect(selectMessages(store.getState(), 'conv-1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('hydrates messages from repository command sync', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromCommandResult('listMessages', [
      legacyMessage('msg-a', 'conv-1'),
      legacyMessage('msg-b', 'conv-1'),
    ]);
    expect(selectMessagesForUi(store.getState(), 'conv-1').map((m) => m.id)).toEqual([
      'msg-a',
      'msg-b',
    ]);
  });

  it('applyFloatingMessagesUpdater patches store for optimistic outbound', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    syncStoreFromCommandResult('listMessages', [legacyMessage('m1', 'conv-1')]);

    applyFloatingMessagesUpdater('conv-1', (prev) => [
      ...prev,
      legacyMessage('optimistic-1', 'conv-1', { status: 'sending' }),
    ]);

    expect(selectMessageCount(store.getState(), 'conv-1')).toBe(2);
  });

  it('compareFloatingMessageParity validates ids ordering and status', () => {
    const repository = [
      legacyMessage('a', 'c1', { status: 'delivered' }),
      legacyMessage('b', 'c1', { status: 'read' }),
    ];
    const store = [
      legacyMessage('a', 'c1', { status: 'delivered' }),
      legacyMessage('b', 'c1', { status: 'read' }),
    ];
    const ok = compareFloatingMessageParity({ repositoryMessages: repository, storeMessages: store });
    expect(ok.parity).toBe(true);

    const bad = compareFloatingMessageParity({
      repositoryMessages: repository,
      storeMessages: [legacyMessage('a', 'c1', { status: 'sent' })],
    });
    expect(bad.parity).toBe(false);
  });

  it('records floating message metrics when CHAT_CORE_METRICS is on', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    recordFloatingMessageRender({
      source: 'store',
      durationMs: 8,
      messageCount: 3,
    });
    expect(getFloatingMessageMetricsSnapshot()).toMatchObject({
      messageRenderSource: 'store',
      messageRenderMs: 8,
      messageCount: 3,
    });
  });

  it('feature flag OFF disables domain store session', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
    expect(getChatDomainStoreSession()).toBeNull();
  });

  it('feature flag ON enables store message reads', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const session = getChatDomainStoreSession();
    expect(session).not.toBeNull();
    setChatDomainStoreSessionForTests(session);
    syncStoreFromCommandResult('listMessages', [legacyMessage('m1', 'conv-1')]);
    expect(selectMessagesForUi(session!.getState(), 'conv-1').map((m) => m.id)).toEqual(['m1']);
  });

  it('loadMessagesCommand hydrates store from repository', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    const { loadMessagesCommand } = await import('../core/commands');
    await loadMessagesCommand('conv-1');

    expect(selectMessagesForUi(store.getState(), 'conv-1').map((m) => m.id)).toEqual([
      'msg-1',
      'msg-2',
    ]);
  });
});
