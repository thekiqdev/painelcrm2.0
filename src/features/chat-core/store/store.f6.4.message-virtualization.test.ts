/**
 * F6.4 — Message Virtualization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  selectMessageVirtualWindow,
  selectMessageOverscan,
  selectMessageRenderCount,
  selectVisibleMessages,
  selectComputedMessageWindow,
  selectResidentPages,
  createMessageVirtualEngine,
  setMessageVirtualConfigForTests,
  DEFAULT_MESSAGE_ROW_HEIGHT,
  resetMessageVirtualizationMetrics,
  getMessageVirtualizationMetricsSnapshot,
  shouldUseChatDomainStore,
  setWindowCacheLimitsForTests,
  captureScrollAnchor,
  restoreScrollAnchor,
  resetScrollAnchorsForTests,
} from './index';
import { chatDomainActionCreators } from './actions';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainMessage } from '../domain/types';
import { createMessageHeightCache } from '../virtualization/messageHeightCache';

function msg(id: string, conversationId = 'c1', sentAt = '2026-07-01T12:00:00.000Z'): ChatDomainMessage {
  return {
    id,
    conversationId,
    direction: 'incoming',
    body: id,
    status: 'delivered',
    sentAt,
    externalMessageId: null,
    clientMessageId: null,
    raw: {},
  };
}

describe('F6.4 message virtualization', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    setMessageVirtualConfigForTests({
      overscan: 12,
      estimatedRowHeight: DEFAULT_MESSAGE_ROW_HEIGHT,
    });
    setWindowCacheLimitsForTests({ maxResidentPages: 5, maxMessagesEstimate: 250 });
    resetMessageVirtualizationMetrics();
    resetScrollAnchorsForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    setMessageVirtualConfigForTests(null);
    setWindowCacheLimitsForTests(null);
    resetMessageVirtualizationMetrics();
    resetScrollAnchorsForTests();
  });

  it('small thread: window covers all messages', () => {
    const ids = ['m1', 'm2', 'm3'];
    const win = selectComputedMessageWindow(ids, 0, 500);
    expect(win.visibleStart).toBe(0);
    expect(win.visibleEnd).toBe(2);
    expect(win.renderCount).toBe(3);
    expect(win.totalHeight).toBe(3 * DEFAULT_MESSAGE_ROW_HEIGHT);
  });

  it('giant thread: only viewport + overscan rendered', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `m${i}`);
    const win = selectComputedMessageWindow(ids, 0, 460);
    expect(win.renderCount).toBeLessThan(40);
    expect(win.renderCount).toBeGreaterThan(5);
    expect(ids.length - win.renderCount).toBeGreaterThan(1900);
  });

  it('realtime append: store window scroll preserved on unrelated updates', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m1'),
        msg('m2', 'c1', '2026-07-01T13:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageVirtualWindow({
        enabled: true,
        conversationId: 'c1',
        scrollTop: 200,
        viewportHeight: 400,
        visibleStart: 0,
        visibleEnd: 1,
        overscanStart: 0,
        overscanEnd: 1,
      }),
    );
    store.dispatch(
      chatDomainActionCreators.appendMessage(
        'c1',
        msg('m3', 'c1', '2026-07-01T14:00:00.000Z'),
      ),
    );
    const window = selectMessageVirtualWindow(store.getState());
    expect(window.scrollTop).toBe(200);
    expect(window.viewportHeight).toBe(400);
  });

  it('realtime update: message patch does not reset virtual window', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(chatDomainActionCreators.setMessages('c1', [msg('m1')]));
    store.dispatch(
      chatDomainActionCreators.setMessageVirtualWindow({
        enabled: true,
        conversationId: 'c1',
        scrollTop: 80,
        viewportHeight: 300,
        visibleStart: 0,
        visibleEnd: 0,
        overscanStart: 0,
        overscanEnd: 0,
      }),
    );
    store.dispatch(
      chatDomainActionCreators.updateMessage('c1', 'm1', { status: 'read' }),
    );
    expect(selectMessageVirtualWindow(store.getState()).scrollTop).toBe(80);
  });

  it('Load More prepend: scroll anchor helpers preserve position', () => {
    const el = { scrollHeight: 2000, scrollTop: 800 };
    const snap = captureScrollAnchor(el, 'c1');
    el.scrollHeight = 2600;
    const top = restoreScrollAnchor(el, snap);
    expect(top).toBe(1400);
  });

  it('resize changes visible range', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `m${i}`);
    const narrow = selectComputedMessageWindow(ids, 0, 180);
    const wide = selectComputedMessageWindow(ids, 0, 720);
    expect(wide.visibleEnd).toBeGreaterThan(narrow.visibleEnd);
  });

  it('height cache hit/miss and dynamic heights', () => {
    const cache = createMessageHeightCache(92);
    expect(cache.get('x', { track: true })).toBe(92);
    cache.set('x', 120);
    expect(cache.get('x', { track: true })).toBe(120);
    const win = selectComputedMessageWindow(['a', 'b'], 0, 300, { a: 100, b: 50 });
    expect(win.totalHeight).toBe(150);
    const metrics = getMessageVirtualizationMetricsSnapshot();
    expect(metrics.heightCacheHits + metrics.heightCacheMisses).toBeGreaterThan(0);
  });

  it('rollback CHAT_CORE_STORE OFF disables store path', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('stress 50000 messages: constant render bound', () => {
    const ids = Array.from({ length: 50_000 }, (_, i) => `m${i}`);
    const samples = [0, 92 * 1000, 92 * 25000, 92 * 49000].map((scrollTop) =>
      selectComputedMessageWindow(ids, scrollTop, 920),
    );
    for (const win of samples) {
      expect(win.renderCount).toBeLessThanOrEqual(50);
      expect(win.totalHeight).toBe(50_000 * DEFAULT_MESSAGE_ROW_HEIGHT);
    }
  });

  it('performance constant across repeated computes', () => {
    const engine = createMessageVirtualEngine();
    const ids = Array.from({ length: 10_000 }, (_, i) => `m${i}`);
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      engine.compute({
        messageIds: ids,
        scrollTop: i * 300,
        viewportHeight: 600,
      });
    }
    expect(performance.now() - t0).toBeLessThan(3000);
    const last = engine.compute({
      messageIds: ids,
      scrollTop: 5000,
      viewportHeight: 600,
    });
    expect(last.renderCount).toBeLessThan(50);
  });

  it('Window Cache integrado: resident messages virtualize without losing cursor', () => {
    const store = getChatDomainStoreSession()!;
    const latest = Array.from({ length: 20 }, (_, i) =>
      msg(`n${i}`, 'c1', `2026-07-02T${String(10 + i).padStart(2, '0')}:00:00.000Z`),
    );
    store.dispatch(chatDomainActionCreators.setMessages('c1', latest));
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'keep',
        hasMore: true,
      }),
    );
    for (let p = 0; p < 6; p++) {
      store.dispatch(
        chatDomainActionCreators.prependPage(
          'c1',
          [msg(`o${p}`, 'c1', `2026-06-0${(p % 9) + 1}T10:00:00.000Z`)],
          { nextCursor: `c${p}`, hasMore: true },
        ),
      );
    }
    const state = store.getState();
    expect(selectResidentPages(state, 'c1').length).toBeLessThanOrEqual(5);
    const residentIds = state.messages.byConversationId['c1'] ?? [];
    const win = selectComputedMessageWindow(residentIds, 0, 400);
    expect(win.renderCount).toBeLessThanOrEqual(residentIds.length);
    expect(win.renderCount).toBeGreaterThan(0);
    expect(state.messages.hasMoreByConversationId['c1']).toBe(true);
    expect(state.messages.nextCursorByConversationId['c1']).toBeTruthy();
  });

  it('store selectors reflect synchronized message window', () => {
    const store = getChatDomainStoreSession()!;
    const rows = Array.from({ length: 40 }, (_, i) =>
      msg(`m${i}`, 'c1', `2026-07-01T${String(10 + (i % 10)).padStart(2, '0')}:00:00.000Z`),
    );
    store.dispatch(chatDomainActionCreators.setMessages('c1', rows));
    store.dispatch(
      chatDomainActionCreators.setMessageVirtualWindow({
        enabled: true,
        conversationId: 'c1',
        visibleStart: 4,
        visibleEnd: 8,
        overscanStart: 0,
        overscanEnd: 15,
        scrollTop: 100,
        viewportHeight: 400,
      }),
    );
    const state = store.getState();
    expect(selectMessageOverscan(state)).toEqual({ overscanStart: 0, overscanEnd: 15 });
    expect(selectMessageRenderCount(state)).toBe(16);
    expect(selectVisibleMessages(state, 'c1')).toHaveLength(16);
  });
});
