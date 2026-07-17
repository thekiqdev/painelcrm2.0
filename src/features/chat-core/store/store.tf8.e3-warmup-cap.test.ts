/**
 * TF8 E3 — Cap warmup de mensagens (≤2) + skip Store + selected owned by open.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  chatDomainActionCreators,
  selectMessageCount,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainMessage } from '../domain/types';
import {
  buildPrefetchQueue,
  createWarmWindowEngine,
  createPredictivePrefetchController,
  DEFAULT_WARM_CONVERSATION_COUNT,
  resetWarmWindowEngineForTests,
} from '../prefetch';
import { resetPrefetchMetrics } from '../metrics/prefetchMetrics';

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

describe('TF8 E3 warmup cap', () => {
  beforeEach(() => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    resetWarmWindowEngineForTests();
    resetPrefetchMetrics();
  });

  afterEach(() => {
    resetWarmWindowEngineForTests();
    resetPrefetchMetrics();
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('DEFAULT_WARM_CONVERSATION_COUNT is 2 (selected + 0–1)', () => {
    expect(DEFAULT_WARM_CONVERSATION_COUNT).toBe(2);
  });

  it('buildPrefetchQueue respects max 2', () => {
    const warm = createWarmWindowEngine(2);
    const queue = buildPrefetchQueue({
      selectedId: 'c0',
      lastOpenedId: 'prev',
      orderedIds: ['a', 'prev', 'c0', 'b', 'c', 'd'],
      conversations: [
        { id: 'a', unreadCount: 3 },
        { id: 'prev' },
        { id: 'c0' },
        { id: 'b' },
        { id: 'c', unreadCount: 2 },
        { id: 'd', unreadCount: 1 },
      ],
      warmEngine: warm,
      maxCount: DEFAULT_WARM_CONVERSATION_COUNT,
    });
    expect(queue.length).toBeLessThanOrEqual(2);
    expect(queue[0]).toBe('c0');
  });

  it('skips HTTP for selected (open pipeline owns) and already-warm Store', async () => {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    store.dispatch(chatDomainActionCreators.setMessages('c2', [domainMsg('m2', 'c2')]));
    expect(selectMessageCount(store.getState(), 'c2')).toBe(1);

    const warm = createWarmWindowEngine(2);
    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      maxCount: 2,
      getState: () => store.getState(),
      load,
    });

    const loaded = await controller.runImmediate({
      selectedId: 'c1',
      orderedIds: ['c1', 'c2', 'c3'],
      conversations: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    });

    expect(load).not.toHaveBeenCalledWith('c1');
    expect(load).not.toHaveBeenCalledWith('c2');
    // fila max 2 = c1 + c2 → ambos skip → 0 loads
    expect(loaded).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads at most 1 neighbor when selected is cold (open owns selected)', async () => {
    const warm = createWarmWindowEngine(2);
    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      maxCount: 2,
      getState: () => null,
      load,
    });

    const loaded = await controller.runImmediate({
      selectedId: 'c1',
      orderedIds: ['c0', 'c1', 'c2', 'c3', 'c4'],
      conversations: [
        { id: 'c0' },
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3', unreadCount: 5 },
        { id: 'c4', unreadCount: 4 },
      ],
    });

    expect(load).not.toHaveBeenCalledWith('c1');
    expect(load.mock.calls.length).toBeLessThanOrEqual(1);
    expect(loaded.length).toBeLessThanOrEqual(1);
  });
});
