/**
 * F6.6 — Warm Window & Predictive Prefetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  chatDomainActionCreators,
  shouldUseChatDomainStore,
  selectMessageCount,
} from './index';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainMessage } from '../domain/types';
import {
  computeHeatScore,
  rankByHeatScore,
  buildPrefetchQueue,
  createWarmWindowEngine,
  createPredictivePrefetchController,
  isConversationAlreadyWarm,
  resetWarmWindowEngineForTests,
  getWarmWindowEngine,
  DEFAULT_WARM_CONVERSATION_COUNT,
} from '../prefetch';
import {
  getPrefetchMetricsSnapshot,
  resetPrefetchMetrics,
} from '../metrics/prefetchMetrics';

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

describe('F6.6 warm window & prefetch', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    resetPrefetchMetrics();
    resetWarmWindowEngineForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetPrefetchMetrics();
    resetWarmWindowEngineForTests();
  });

  it('telemetria: snapshot e reset', () => {
    const warm = createWarmWindowEngine(3);
    warm.noteOpenOutcome('c1', null);
    warm.recordOpen('c1');
    const snap = getPrefetchMetricsSnapshot();
    expect(snap.warmWindowMisses).toBeGreaterThanOrEqual(1);
    resetPrefetchMetrics();
    expect(getPrefetchMetricsSnapshot().warmWindowMisses).toBe(0);
  });

  it('heat score: unread e recência ganham prioridade', () => {
    const now = Date.parse('2026-07-13T12:00:00.000Z');
    const ranked = rankByHeatScore(
      [
        { id: 'old', unreadCount: 0, lastMessageAt: '2026-06-01T12:00:00.000Z' },
        { id: 'unread', unreadCount: 3, lastMessageAt: '2026-07-13T11:00:00.000Z' },
        { id: 'recent', unreadCount: 0, lastMessageAt: '2026-07-13T11:55:00.000Z' },
      ],
      { nowMs: now },
    );
    expect(ranked[0]!.id).toBe('unread');
    expect(computeHeatScore(ranked[0]!, { nowMs: now })).toBeGreaterThan(
      computeHeatScore(ranked[2]!, { nowMs: now }),
    );
  });

  it('prefetch idle: agenda e carrega via idle (imediato em teste)', async () => {
    const warm = createWarmWindowEngine(5);
    const loaded: string[] = [];
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      getState: () => getChatDomainStoreSession()?.getState() ?? null,
      load: async (id) => {
        loaded.push(id);
        getChatDomainStoreSession()!.dispatch(
          chatDomainActionCreators.setMessages(id, [domainMsg(`m-${id}`, id)]),
        );
      },
    });

    await controller.runImmediate({
      selectedId: 'c2',
      orderedIds: ['c1', 'c2', 'c3'],
      conversations: [
        { id: 'c1', unreadCount: 0 },
        { id: 'c2', unreadCount: 0 },
        { id: 'c3', unreadCount: 1 },
      ],
    });

    expect(loaded.length).toBeGreaterThan(0);
    expect(getPrefetchMetricsSnapshot().prefetchRequests).toBeGreaterThan(0);
  });

  it('warm window hit: conversa já residente', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(chatDomainActionCreators.setMessages('c1', [domainMsg('m1', 'c1')]));
    const warm = createWarmWindowEngine();
    expect(isConversationAlreadyWarm(store.getState(), 'c1')).toBe(true);
    expect(warm.noteOpenOutcome('c1', store.getState())).toBe('hit');
    expect(getPrefetchMetricsSnapshot().warmWindowHits).toBe(1);
  });

  it('warm window miss: conversa fria', () => {
    const warm = createWarmWindowEngine();
    const store = getChatDomainStoreSession()!;
    expect(isConversationAlreadyWarm(store.getState(), 'c-cold')).toBe(false);
    expect(warm.noteOpenOutcome('c-cold', store.getState())).toBe('miss');
    expect(getPrefetchMetricsSnapshot().warmWindowMisses).toBe(1);
  });

  it('cancelamento: idle cancelado antes de carregar', async () => {
    vi.useFakeTimers();
    const warm = createWarmWindowEngine();
    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: true,
      idleTimeoutMs: 5000,
      idleFallbackMs: 2000,
      getState: () => null,
      load,
    });

    controller.schedule({
      selectedId: 'a',
      orderedIds: ['a', 'b'],
      conversations: [{ id: 'a' }, { id: 'b' }],
    });
    controller.cancel('test');
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    expect(getPrefetchMetricsSnapshot().prefetchCancellation).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it('scroll rápido: cancel + nova agenda não duplica in-flight', async () => {
    const warm = createWarmWindowEngine();
    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      getState: () => null,
      load,
    });

    const p1 = controller.runImmediate({
      selectedId: 'c2',
      orderedIds: ['c1', 'c2', 'c3'],
      conversations: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    });
    // Troca rápida — nova generation cancela a fila anterior
    const p2 = controller.runImmediate({
      selectedId: 'c3',
      orderedIds: ['c1', 'c2', 'c3'],
      conversations: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    });
    await Promise.all([p1, p2]);
    expect(controller.getLastQueue()[0]).toBe('c3');
    expect(controller.getInFlight().size).toBe(0);
  });

  it('troca rápida de conversa: lastOpened e vizinhos na fila', () => {
    const warm = createWarmWindowEngine();
    warm.recordOpen('c1');
    warm.recordOpen('c2');
    const queue = buildPrefetchQueue({
      selectedId: 'c3',
      lastOpenedId: warm.getLastOpenedId(),
      orderedIds: ['c1', 'c2', 'c3', 'c4'],
      conversations: [
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
        { id: 'c4', unreadCount: 2 },
      ],
      warmEngine: warm,
      maxCount: 5,
    });
    expect(queue[0]).toBe('c3');
    expect(queue).toContain('c2'); // last opened
    expect(queue).toContain('c2'); // above of c3? c2 is above
    expect(queue).toContain('c4'); // below
  });

  it('window cache integrado: skip load se residente', async () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(chatDomainActionCreators.setMessages('c1', [domainMsg('m1', 'c1')]));
    expect(selectMessageCount(store.getState(), 'c1')).toBe(1);

    const warm = createWarmWindowEngine();
    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      getState: () => store.getState(),
      load,
    });

    await controller.runImmediate({
      selectedId: 'c1',
      orderedIds: ['c1', 'c2'],
      conversations: [{ id: 'c1' }, { id: 'c2' }],
    });

    expect(load).not.toHaveBeenCalledWith('c1');
    expect(getPrefetchMetricsSnapshot().prefetchHits).toBeGreaterThanOrEqual(1);
    // c2 still cold → load
    expect(load).toHaveBeenCalledWith('c2');
  });

  it('stress: capacity LRU e fila limitada', async () => {
    const warm = createWarmWindowEngine(DEFAULT_WARM_CONVERSATION_COUNT);
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
    for (const id of ids) warm.markWarm(id);
    expect(warm.size()).toBe(DEFAULT_WARM_CONVERSATION_COUNT);

    const load = vi.fn(async () => undefined);
    const controller = createPredictivePrefetchController({
      warmEngine: warm,
      idleOnly: false,
      maxCount: DEFAULT_WARM_CONVERSATION_COUNT,
      getState: () => null,
      load,
    });

    const loaded = await controller.runImmediate({
      selectedId: 'c0',
      orderedIds: ids,
      conversations: ids.map((id) => ({ id, unreadCount: 1 })),
    });
    expect(loaded.length + getPrefetchMetricsSnapshot().prefetchHits).toBeLessThanOrEqual(
      ids.length,
    );
    expect(load.mock.calls.length).toBeLessThanOrEqual(DEFAULT_WARM_CONVERSATION_COUNT);
  });

  it('rollback OFF: flag store desligada', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
    // Singleton warm engine ainda exists mas UI hook não agenda (gate no hook).
    const engine = getWarmWindowEngine();
    engine.clear();
    expect(engine.size()).toBe(0);
  });

  it('fila: prioridade current > last > neighbors > unread', () => {
    const warm = createWarmWindowEngine();
    warm.recordOpen('prev');
    const queue = buildPrefetchQueue({
      selectedId: 'cur',
      lastOpenedId: 'prev',
      orderedIds: ['a', 'prev', 'cur', 'b', 'unread'],
      conversations: [
        { id: 'a', unreadCount: 0 },
        { id: 'prev', unreadCount: 0 },
        { id: 'cur', unreadCount: 0 },
        { id: 'b', unreadCount: 0 },
        { id: 'unread', unreadCount: 5, lastMessageAt: '2026-07-13T12:00:00.000Z' },
      ],
      warmEngine: warm,
      maxCount: 5,
      nowMs: Date.parse('2026-07-13T12:00:00.000Z'),
    });
    expect(queue[0]).toBe('cur');
    expect(queue[1]).toBe('prev');
    expect(queue).toContain('b'); // below cur
    expect(queue).toContain('unread');
    expect(queue.length).toBeLessThanOrEqual(5);
  });
});
