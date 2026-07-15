/**
 * F6.5 — Realtime Render Optimization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  syncStoreFromSocketEvent,
  chatDomainActionCreators,
  shouldUseChatDomainStore,
  createMemoizedSelector,
  shallowEqual,
  conversationsUiEqual,
  messagesUiEqual,
  conversationUiFingerprint,
  messageUiFingerprint,
  dispatchStoreActionsBatched,
  flushSocketActionQueueForTests,
  resetSocketActionQueueForTests,
  getRenderOptimizationMetricsSnapshot,
  resetRenderOptimizationMetrics,
  selectChatMessagesForUi,
} from './index';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainMessage } from '../domain/types';
import type { ChatMessage } from '@/services/chat';

function domainMsg(
  id: string,
  conversationId = 'c1',
  patch: Partial<ChatDomainMessage> = {},
): ChatDomainMessage {
  return {
    id,
    conversationId,
    direction: 'incoming',
    body: id,
    status: 'delivered',
    sentAt: '2026-07-13T12:00:00.000Z',
    externalMessageId: null,
    clientMessageId: null,
    raw: {},
    ...patch,
  };
}

const legacyMessage = (id: string, conversationId: string, status = 'delivered'): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body: `body-${id}`,
    status,
    sent_at: '2026-07-13T12:00:00.000Z',
  }) as ChatMessage;

describe('F6.5 render optimization', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    resetRenderOptimizationMetrics();
    resetSocketActionQueueForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetRenderOptimizationMetrics();
    resetSocketActionQueueForTests();
  });

  it('nova mensagem: append via realtime', () => {
    const store = getChatDomainStoreSession()!;
    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      payload: { message: legacyMessage('m1', 'c1') },
      conversationId: 'c1',
      instanceId: null,
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'c1').map((m) => m.id)).toEqual(['m1']);
  });

  it('mensagem editada: update body/status', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(chatDomainActionCreators.setMessages('c1', [domainMsg('m1', 'c1', { status: 'sent' })]));
    syncStoreFromSocketEvent({
      kind: 'message.updated',
      protocol: 'normalized',
      payload: { message: legacyMessage('m1', 'c1', 'delivered') },
      conversationId: 'c1',
      messageId: 'm1',
      receivedAt: Date.now(),
    });
    expect(selectChatMessagesForUi(store.getState(), 'c1')[0]?.status).toBe('delivered');
  });

  it('mensagem entregue: fingerprint muda só do item afetado', () => {
    const a = messageUiFingerprint({ id: 'm1', status: 'sent', body: 'hi' });
    const b = messageUiFingerprint({ id: 'm1', status: 'delivered', body: 'hi' });
    const c = messageUiFingerprint({ id: 'm2', status: 'sent', body: 'other' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(
      messagesUiEqual(
        [{ id: 'm1', status: 'sent' }],
        [{ id: 'm1', status: 'sent' }],
      ),
    ).toBe(true);
    expect(
      messagesUiEqual(
        [{ id: 'm1', status: 'sent' }],
        [{ id: 'm1', status: 'delivered' }],
      ),
    ).toBe(false);
  });

  it('mensagem lida: conversation fingerprint isola unread', () => {
    const unread = conversationUiFingerprint({
      id: 'c1',
      unreadCount: 2,
      lastMessagePreview: 'x',
    });
    const read = conversationUiFingerprint({
      id: 'c1',
      unreadCount: 0,
      lastMessagePreview: 'x',
    });
    expect(unread).not.toBe(read);
    expect(
      conversationsUiEqual(
        [{ id: 'c1', unreadCount: 0 }],
        [{ id: 'c1', unreadCount: 0 }],
      ),
    ).toBe(true);
  });

  it('realtime burst: múltiplos eventos no mesmo tick → 1 batch flush', async () => {
    const store = getChatDomainStoreSession()!;
    let notifies = 0;
    store.subscribe(() => {
      notifies += 1;
    });

    const { runSocketBatch } = await import('./storeBatch');
    runSocketBatch(() => {
      for (let i = 0; i < 30; i++) {
        syncStoreFromSocketEvent({
          kind: 'message.created',
          protocol: 'v2',
          payload: { message: legacyMessage(`m${i}`, 'c1') },
          conversationId: 'c1',
          instanceId: null,
          receivedAt: Date.now(),
        });
      }
    }, store);
    expect(notifies).toBe(1);
    expect(selectChatMessagesForUi(store.getState(), 'c1')).toHaveLength(30);
    expect(getRenderOptimizationMetricsSnapshot().batchedDispatches).toBeGreaterThanOrEqual(1);
  });

  it('batch dispatch: N actions / 1 notify', () => {
    const store = getChatDomainStoreSession()!;
    let notifies = 0;
    store.subscribe(() => {
      notifies += 1;
    });
    dispatchStoreActionsBatched(store, [
      chatDomainActionCreators.setMessages('c1', [domainMsg('a')]),
      chatDomainActionCreators.appendMessage('c1', domainMsg('b', 'c1', { sentAt: '2026-07-13T13:00:00.000Z' })),
      chatDomainActionCreators.updateMessage('c1', 'a', { status: 'read' }),
    ]);
    expect(notifies).toBe(1);
    expect(selectChatMessagesForUi(store.getState(), 'c1').map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('selector memo: resultado estável quando equal', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(chatDomainActionCreators.setMessages('c1', [domainMsg('m1')]));
    const selectCount = vi.fn((state: ReturnType<typeof store.getState>) =>
      selectChatMessagesForUi(state, 'c1'),
    );
    const memo = createMemoizedSelector(selectCount, messagesUiEqual, 'test-messages');
    const s1 = store.getState();
    const r1 = memo(s1);
    const r2 = memo(s1);
    expect(r1).toBe(r2);
    expect(selectCount).toHaveBeenCalledTimes(1);

    store.dispatch(chatDomainActionCreators.updateMessage('c1', 'm1', { status: 'read' }));
    const s2 = store.getState();
    const r3 = memo(s2);
    expect(r3).not.toBe(r1);
    expect(r3[0]?.status).toBe('read');
  });

  it('conversation update: fingerprint muda só na conversa afetada', () => {
    const left = [
      { id: 'c1', unreadCount: 1, lastMessagePreview: 'a' },
      { id: 'c2', unreadCount: 0, lastMessagePreview: 'b' },
    ];
    const right = [
      { id: 'c1', unreadCount: 2, lastMessagePreview: 'a' },
      { id: 'c2', unreadCount: 0, lastMessagePreview: 'b' },
    ];
    expect(conversationsUiEqual(left, left)).toBe(true);
    expect(conversationsUiEqual(left, right)).toBe(false);
  });

  it('message update: shallowEqual object slices', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('stress websocket: 100 events → single notify após batch', async () => {
    const store = getChatDomainStoreSession()!;
    let notifies = 0;
    store.subscribe(() => {
      notifies += 1;
    });
    const { runSocketBatch } = await import('./storeBatch');
    runSocketBatch(() => {
      for (let i = 0; i < 100; i++) {
        syncStoreFromSocketEvent({
          kind: 'message.created',
          protocol: 'v2',
          payload: { message: legacyMessage(`s${i}`, 'c1') },
          conversationId: 'c1',
          instanceId: null,
          receivedAt: Date.now(),
        });
      }
    }, store);
    expect(notifies).toBe(1);
    expect(selectChatMessagesForUi(store.getState(), 'c1')).toHaveLength(100);
  });

  it('rollback CHAT_CORE_STORE OFF', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('stable references: memoized selector preserves array ref', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [domainMsg('m1'), domainMsg('m2')]),
    );
    const memo = createMemoizedSelector(
      (s) => selectChatMessagesForUi(s, 'c1'),
      messagesUiEqual,
    );
    const a = memo(store.getState());
    // unrelated conversation touch
    store.dispatch(chatDomainActionCreators.setSelectedConversation('other'));
    const b = memo(store.getState());
    // state changed but messages equal → same ref
    expect(a).toBe(b);
    flushSocketActionQueueForTests(store);
  });
});
