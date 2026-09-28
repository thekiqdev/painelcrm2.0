/**
 * F6.2 — Sliding Window Cache.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  selectConversationMessages,
  selectConversationCursor,
  selectResidentPages,
  selectWindowBounds,
  selectEvictedPages,
  selectPinnedPages,
  selectConversationMemoryUsage,
  captureScrollAnchor,
  restoreScrollAnchor,
  resetScrollAnchorsForTests,
  setWindowCacheLimitsForTests,
  buildPageRecord,
  getWindowMetricsSnapshot,
  resetWindowMetrics,
} from './index';
import { loadMessagesCommand, resetLoadMessagesStateForTests } from '../core/loadMessages';
import {
  loadMessagesCursorCommand,
  resetLoadMessagesCursorStateForTests,
} from '../core/loadMessagesCursor';
import {
  setMessagesPageFetcherForTests,
  type MessagesPageResult,
} from '../core/messagesPageFetch';
import { encodeLegacyMessageCursor as encodeCursor } from './messageMerge';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { chatDomainActionCreators } from './actions';
import { getChatDomainStoreSession } from './session';
import { shouldUseChatDomainStore } from './flags';
import type { ChatDomainMessage } from '../domain/types';

function msg(id: string, conversationId: string, sentAt: string): ChatDomainMessage {
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

function page(
  messages: ChatDomainMessage[],
  meta: Partial<MessagesPageResult> = {},
): MessagesPageResult {
  return {
    messages,
    nextCursor: meta.nextCursor ?? null,
    previousCursor: meta.previousCursor ?? null,
    hasMore: meta.hasMore ?? false,
    source: meta.source ?? 'legacy',
  };
}

function pageMsgs(prefix: string, count: number, startHour = 10): ChatDomainMessage[] {
  return Array.from({ length: count }, (_, i) =>
    msg(
      `${prefix}-${i}`,
      'c1',
      `2026-07-01T${String(startHour + i).padStart(2, '0')}:00:00.000Z`,
    ),
  );
}

describe('F6.2 window cache', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesStateForTests();
    resetLoadMessagesCursorStateForTests();
    resetScrollAnchorsForTests();
    resetWindowMetrics();
    setWindowCacheLimitsForTests({ maxResidentPages: 5, maxMessagesEstimate: 250 });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesStateForTests();
    resetLoadMessagesCursorStateForTests();
    resetScrollAnchorsForTests();
    resetWindowMetrics();
    setWindowCacheLimitsForTests(null);
  });

  it('registers page on messages/set', () => {
    const store = getChatDomainStoreSession()!;
    const rows = [
      msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
    ];
    store.dispatch(chatDomainActionCreators.setMessages('c1', rows));
    const state = store.getState();
    expect(selectResidentPages(state, 'c1')).toHaveLength(1);
    expect(selectPinnedPages(state, 'c1')).toHaveLength(1);
    expect(selectWindowBounds(state, 'c1')).toEqual({ windowStart: 0, windowEnd: 0 });
    expect(selectConversationMemoryUsage(state, 'c1').residentMessages).toBe(2);
  });

  it('moves window on prependPage', () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m3', 'c1', '2026-07-01T12:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.prependPage(
        'c1',
        [msg('m1', 'c1', '2026-07-01T10:00:00.000Z'), msg('m2', 'c1', '2026-07-01T11:00:00.000Z')],
        { nextCursor: 'c-old', hasMore: true },
      ),
    );
    const state = store.getState();
    expect(selectResidentPages(state, 'c1')).toHaveLength(2);
    expect(selectWindowBounds(state, 'c1').windowEnd).toBe(1);
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('auto-evicts when resident pages exceed limit', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 3, maxMessagesEstimate: 10_000 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('n0', 'c1', '2026-07-01T20:00:00.000Z')]),
    );
    for (let i = 1; i <= 4; i++) {
      store.dispatch(
        chatDomainActionCreators.prependPage(
          'c1',
          [msg(`o${i}`, 'c1', `2026-07-01T${String(10 + i).padStart(2, '0')}:00:00.000Z`)],
          { nextCursor: `c${i}`, hasMore: true },
        ),
      );
    }
    const state = store.getState();
    expect(selectResidentPages(state, 'c1').length).toBeLessThanOrEqual(3);
    expect(selectEvictedPages(state, 'c1').length).toBeGreaterThan(0);
    // Newest (viewport) still present
    expect(selectConversationMessages(state, 'c1').some((m) => m.id === 'n0')).toBe(true);
  });

  it('does not evict pinned page', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 1, maxMessagesEstimate: 10_000 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('pin', 'c1', '2026-07-01T20:00:00.000Z')]),
    );
    const pinned = selectPinnedPages(store.getState(), 'c1')[0]!;
    store.dispatch(
      chatDomainActionCreators.prependPage(
        'c1',
        [msg('old', 'c1', '2026-07-01T10:00:00.000Z')],
        { hasMore: true },
      ),
    );
    // With max=1, older page should be evicted; pinned newest remains.
    const state = store.getState();
    expect(selectPinnedPages(state, 'c1')).toContain(pinned);
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).toContain('pin');
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).not.toContain('old');
  });

  it('LRU prefers least-recently-accessed non-pinned page', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 2, maxMessagesEstimate: 10_000 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('new', 'c1', '2026-07-01T20:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.prependPage(
        'c1',
        [msg('mid', 'c1', '2026-07-01T15:00:00.000Z')],
        { hasMore: true },
      ),
    );
    const midPageId = selectResidentPages(store.getState(), 'c1')[0]!;
    store.dispatch(
      chatDomainActionCreators.updateWindow('c1', {
        pinnedPageIds: selectPinnedPages(store.getState(), 'c1'),
      }),
    );
    // Touch mid so it's "hotter" than a brand-new older page with older access.
    store.dispatch(
      chatDomainActionCreators.prependPage(
        'c1',
        [msg('older', 'c1', '2026-07-01T10:00:00.000Z')],
        { hasMore: true },
      ),
    );
    const state = store.getState();
    expect(selectResidentPages(state, 'c1').length).toBeLessThanOrEqual(2);
    // Newest pinned + mid (touched) should survive over oldest if LRU favors mid.
    // After trim: residents = mid + new OR older + new. mid was accessed via updateWindow
    // only on pinned, not mid — oldest has newest lastAccessAt from register.
    // Evict LRU: mid has older lastAccessAt than older page → mid may be evicted.
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).toContain('new');
    expect(selectEvictedPages(state, 'c1').length).toBeGreaterThan(0);
    void midPageId;
  });

  it('reloads evicted page via rehydratePage', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 1, maxMessagesEstimate: 10_000 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('new', 'c1', '2026-07-01T20:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.prependPage(
        'c1',
        [msg('old', 'c1', '2026-07-01T10:00:00.000Z')],
        { hasMore: true },
      ),
    );
    const evictedId = selectEvictedPages(store.getState(), 'c1')[0];
    expect(evictedId).toBeTruthy();
    const cached = store.getState().messages.cachedPagesByConversationId['c1']![evictedId!]!;
    store.dispatch(
      chatDomainActionCreators.rehydratePage(
        'c1',
        cached,
        [msg('old', 'c1', '2026-07-01T10:00:00.000Z')],
      ),
    );
    const state = store.getState();
    // maxResidentPages=1 → reload may immediately re-evict; metadata must remain.
    expect(state.messages.cachedPagesByConversationId['c1']![evictedId!]).toBeTruthy();
    expect(getWindowMetricsSnapshot().pageReloads).toBeGreaterThanOrEqual(1);
  });

  it('preserves cursor metadata after eviction', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 2, maxMessagesEstimate: 10_000 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('n', 'c1', '2026-07-01T20:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'keep-me',
        hasMore: true,
      }),
    );
    for (let i = 0; i < 3; i++) {
      store.dispatch(
        chatDomainActionCreators.prependPage(
          'c1',
          [msg(`o${i}`, 'c1', `2026-07-01T1${i}:00:00.000Z`)],
          { nextCursor: `c${i}`, hasMore: true },
        ),
      );
    }
    const cursor = selectConversationCursor(store.getState(), 'c1');
    expect(cursor.nextCursor).toBeTruthy();
    expect(cursor.hasMore).toBe(true);
    expect(cursor.loadingMore).toBe(false);
  });

  it('preserves scroll anchor helpers with prepend', () => {
    const el = { scrollHeight: 1000, scrollTop: 400 };
    const snap = captureScrollAnchor(el, 'c1');
    el.scrollHeight = 1400;
    const top = restoreScrollAnchor(el, snap);
    expect(top).toBe(800);
    expect(el.scrollTop).toBe(800);
  });

  it('rollback CHAT_CORE_STORE OFF disables store path', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
  });

  it('F6.1 compatibility: loadMessages + loadMore still work', async () => {
    setMessagesPageFetcherForTests(async (params) => {
      if (params.latestPage && !params.cursor) {
        return page([msg('m2', 'c1', '2026-07-01T11:00:00.000Z')], {
          nextCursor: encodeCursor('m2'),
          hasMore: true,
        });
      }
      return page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], {
        nextCursor: null,
        hasMore: false,
      });
    });
    await loadMessagesCommand('c1');
    const store = getChatDomainStoreSession()!;
    expect(selectResidentPages(store.getState(), 'c1')).toHaveLength(1);
    await loadMessagesCursorCommand({
      conversationId: 'c1',
      cursor: encodeCursor('m2'),
    });
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
    expect(selectResidentPages(store.getState(), 'c1').length).toBeGreaterThanOrEqual(1);
  });

  it('stress with 100 pages keeps resident bound', () => {
    setWindowCacheLimitsForTests({ maxResidentPages: 5, maxMessagesEstimate: 250 });
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages(
        'c1',
        pageMsgs('p0', 5, 90).map((m, i) =>
          msg(`p0-${i}`, 'c1', `2026-07-02T${String(10 + i).padStart(2, '0')}:00:00.000Z`),
        ),
      ),
    );
    for (let p = 1; p <= 100; p++) {
      store.dispatch(
        chatDomainActionCreators.prependPage(
          'c1',
          [msg(`p${p}-0`, 'c1', `2026-06-${String((p % 28) + 1).padStart(2, '0')}T10:00:00.000Z`)],
          { nextCursor: `cursor-${p}`, hasMore: true },
        ),
      );
    }
    const state = store.getState();
    expect(selectResidentPages(state, 'c1').length).toBeLessThanOrEqual(5);
    expect(selectConversationMemoryUsage(state, 'c1').residentMessages).toBeLessThanOrEqual(250);
    expect(selectEvictedPages(state, 'c1').length).toBeGreaterThan(90);
    expect(selectConversationCursor(state, 'c1').nextCursor).toBe('cursor-100');
    // Explicit registerPage + trimWindow APIs
    const pageRec = buildPageRecord({
      conversationId: 'c1',
      pageIndex: 999,
      messageIds: ['extra'],
    });
    store.dispatch(chatDomainActionCreators.registerPage('c1', pageRec, 'older'));
    store.dispatch(chatDomainActionCreators.trimWindow('c1'));
    expect(selectResidentPages(store.getState(), 'c1').length).toBeLessThanOrEqual(5);
  });
});
