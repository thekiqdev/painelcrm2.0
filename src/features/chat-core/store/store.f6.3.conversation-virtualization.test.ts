/**
 * F6.3 — Conversation Virtualization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  selectConversationVirtualWindow,
  selectConversationOverscan,
  selectConversationRenderCount,
  selectVisibleConversations,
  selectComputedConversationWindow,
  createConversationVirtualEngine,
  setConversationVirtualConfigForTests,
  DEFAULT_CONVERSATION_ROW_HEIGHT,
  resetConversationVirtualizationMetrics,
  getConversationVirtualizationMetricsSnapshot,
  shouldUseChatDomainStore,
} from './index';
import { chatDomainActionCreators } from './actions';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation } from '../domain/types';
import { createConversationHeightCache } from '../virtualization/conversationHeightCache';

function conv(id: string, lastAt = '2026-07-01T12:00:00.000Z'): ChatDomainConversation {
  return {
    id,
    instanceId: 'inst-1',
    channel: 'whatsapp',
    unreadCount: 0,
    lastMessageAt: lastAt,
    lastMessagePreview: 'hi',
    contactName: id,
    phoneNumber: null,
    attendanceStatus: null,
    assignedToUserId: null,
    clientId: null,
    leadId: null,
    conversationType: null,
    raw: {},
  };
}

describe('F6.3 conversation virtualization', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    setConversationVirtualConfigForTests({
      overscan: 10,
      estimatedRowHeight: DEFAULT_CONVERSATION_ROW_HEIGHT,
    });
    resetConversationVirtualizationMetrics();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    setConversationVirtualConfigForTests(null);
    resetConversationVirtualizationMetrics();
  });

  it('small list: window covers all items when they fit', () => {
    const ids = ['a', 'b', 'c'];
    const win = selectComputedConversationWindow(ids, 0, 400);
    expect(win.visibleStart).toBe(0);
    expect(win.visibleEnd).toBe(2);
    expect(win.renderCount).toBe(3);
    expect(win.totalHeight).toBe(3 * DEFAULT_CONVERSATION_ROW_HEIGHT);
  });

  it('large list: only viewport + overscan rendered', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `c${i}`);
    const win = selectComputedConversationWindow(ids, 0, 380);
    // ~5 visible + 10 overscan below (start overscan=0)
    expect(win.renderCount).toBeLessThan(40);
    expect(win.renderCount).toBeGreaterThan(5);
    expect(win.overscanStart).toBe(0);
    expect(ids.length - win.renderCount).toBeGreaterThan(400);
  });

  it('overscan extends above and below visible range', () => {
    setConversationVirtualConfigForTests({ overscan: 5, estimatedRowHeight: 50 });
    const ids = Array.from({ length: 100 }, (_, i) => `c${i}`);
    const win = selectComputedConversationWindow(ids, 50 * 40, 200);
    expect(win.overscanStart).toBeLessThanOrEqual(win.visibleStart);
    expect(win.overscanEnd).toBeGreaterThanOrEqual(win.visibleEnd);
    expect(win.overscanStart).toBe(Math.max(0, win.visibleStart - 5));
    expect(win.overscanEnd).toBe(Math.min(99, win.visibleEnd + 5));
  });

  it('continuous scroll moves the window', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `c${i}`);
    const a = selectComputedConversationWindow(ids, 0, 300);
    const b = selectComputedConversationWindow(ids, DEFAULT_CONVERSATION_ROW_HEIGHT * 50, 300);
    expect(b.visibleStart).toBeGreaterThan(a.visibleStart);
    expect(b.overscanStart).toBeGreaterThan(a.overscanStart);
  });

  it('realtime update: store window sync preserves viewport fields', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setConversations([
        conv('c1'),
        conv('c2'),
        conv('c3'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setConversationVirtualWindow({
        enabled: true,
        visibleStart: 0,
        visibleEnd: 2,
        overscanStart: 0,
        overscanEnd: 2,
        scrollTop: 120,
        viewportHeight: 400,
      }),
    );
    store.dispatch(
      chatDomainActionCreators.setConversations([
        conv('c1', '2026-07-01T13:00:00.000Z'),
        conv('c2'),
        conv('c3'),
      ]),
    );
    const window = selectConversationVirtualWindow(store.getState());
    expect(window.scrollTop).toBe(120);
    expect(window.viewportHeight).toBe(400);
    expect(window.enabled).toBe(true);
  });

  it('selection change does not reset virtual window', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setConversationVirtualWindow({
        enabled: true,
        scrollTop: 500,
        viewportHeight: 400,
        visibleStart: 5,
        visibleEnd: 12,
        overscanStart: 0,
        overscanEnd: 20,
      }),
    );
    store.dispatch(chatDomainActionCreators.setSelectedConversation('c9'));
    const window = selectConversationVirtualWindow(store.getState());
    expect(window.scrollTop).toBe(500);
    expect(window.visibleStart).toBe(5);
  });

  it('resize viewport changes visible range', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `c${i}`);
    const narrow = selectComputedConversationWindow(ids, 0, 150);
    const wide = selectComputedConversationWindow(ids, 0, 600);
    expect(wide.visibleEnd).toBeGreaterThan(narrow.visibleEnd);
    expect(wide.renderCount).toBeGreaterThan(narrow.renderCount);
  });

  it('height cache hit/miss and dynamic heights', () => {
    const cache = createConversationHeightCache(76);
    expect(cache.get('x', { track: true })).toBe(76);
    cache.set('x', 90);
    expect(cache.get('x', { track: true })).toBe(90);
    expect(cache.has('x')).toBe(true);

    const ids = ['a', 'b', 'c'];
    const win = selectComputedConversationWindow(ids, 0, 200, { a: 100, b: 50, c: 100 });
    expect(win.totalHeight).toBe(250);

    const metrics = getConversationVirtualizationMetricsSnapshot();
    expect(metrics.heightCacheHits + metrics.heightCacheMisses).toBeGreaterThan(0);
  });

  it('rollback CHAT_CORE_STORE OFF disables store path', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('stress 10000 conversations: constant render bound', () => {
    const ids = Array.from({ length: 10_000 }, (_, i) => `c${i}`);
    const samples = [0, DEFAULT_CONVERSATION_ROW_HEIGHT * 100, DEFAULT_CONVERSATION_ROW_HEIGHT * 5000, DEFAULT_CONVERSATION_ROW_HEIGHT * 9900].map((scrollTop) =>
      selectComputedConversationWindow(ids, scrollTop, 760),
    );
    for (const win of samples) {
      expect(win.renderCount).toBeLessThanOrEqual(40);
      expect(win.totalHeight).toBe(10_000 * DEFAULT_CONVERSATION_ROW_HEIGHT);
    }
    const spreads = samples.map((w) => w.renderCount);
    const max = Math.max(...spreads);
    const min = Math.min(...spreads);
    expect(max - min).toBeLessThanOrEqual(15);
  });

  it('performance constant: engine compute stays O(n) offsets but bounded render', () => {
    const engine = createConversationVirtualEngine();
    const ids = Array.from({ length: 5000 }, (_, i) => `c${i}`);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      engine.compute({
        conversationIds: ids,
        scrollTop: i * 200,
        viewportHeight: 500,
      });
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    const last = engine.compute({
      conversationIds: ids,
      scrollTop: 1000,
      viewportHeight: 500,
    });
    expect(last.renderCount).toBeLessThan(50);
  });

  it('store selectors reflect synchronized window', () => {
    const store = getChatDomainStoreSession()!;
    const rows = Array.from({ length: 30 }, (_, i) => conv(`c${i}`));
    store.dispatch(chatDomainActionCreators.setConversations(rows));
    store.dispatch(
      chatDomainActionCreators.setConversationVirtualWindow({
        enabled: true,
        visibleStart: 2,
        visibleEnd: 5,
        overscanStart: 0,
        overscanEnd: 10,
        scrollTop: 0,
        viewportHeight: 300,
      }),
    );
    const state = store.getState();
    expect(selectConversationOverscan(state)).toEqual({ overscanStart: 0, overscanEnd: 10 });
    expect(selectConversationRenderCount(state)).toBe(11);
    expect(selectVisibleConversations(state)).toHaveLength(11);
    expect(selectVisibleConversations(state)[0]).toBe(rows[0]!.id);
  });
});
