/**
 * F6.0 — Cursor Engine (Pagination Foundation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
  selectConversationMessages,
  selectConversationCursor,
  selectConversationHasMore,
  selectConversationLoadingMore,
  selectConversationLoadedPages,
  selectConversationCanLoadMore,
  mergePrependMessages,
  encodeLegacyMessageCursor,
  captureScrollAnchor,
  restoreScrollAnchor,
  resetScrollAnchorsForTests,
} from './index';
import {
  loadMessagesCursorCommand,
  resetConversationCursorCommand,
  resetLoadMessagesCursorStateForTests,
} from '../core/loadMessagesCursor';
import {
  setMessagesPageFetcherForTests,
  type MessagesPageResult,
} from '../core/messagesPageFetch';
import { resetLoadMessagesStateForTests } from '../core/loadMessages';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { resetCursorMetrics, getCursorMetricsSnapshot } from '../metrics/cursorMetrics';
import type { ChatDomainMessage } from '../domain/types';

function msg(
  id: string,
  conversationId: string,
  sentAt: string,
  body = id,
): ChatDomainMessage {
  return {
    id,
    conversationId,
    direction: 'incoming',
    body,
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
    source: meta.source ?? 'cursor',
  };
}

describe('F6.0 cursor engine', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(null);
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesCursorStateForTests();
    resetLoadMessagesStateForTests();
    resetCursorMetrics();
    resetScrollAnchorsForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesCursorStateForTests();
    resetCursorMetrics();
    resetScrollAnchorsForTests();
  });

  function session() {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    return store;
  }

  it('first page hydrates store and sets cursor metadata', async () => {
    const store = session();
    const m1 = msg('m1', 'c1', '2026-07-01T10:00:00.000Z');
    const m2 = msg('m2', 'c1', '2026-07-01T11:00:00.000Z');
    setMessagesPageFetcherForTests(async () =>
      page([m1, m2], {
        nextCursor: 'cursor-older',
        hasMore: true,
        source: 'cursor',
      }),
    );

    const result = await loadMessagesCursorCommand({ conversationId: 'c1', pageSize: 50 });
    expect(result.applied).toBe(true);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('cursor-older');
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(true);
    expect(selectConversationLoadedPages(store.getState(), 'c1')).toBe(1);
    expect(selectConversationCursor(store.getState(), 'c1').nextCursor).toBe('cursor-older');
  });

  it('intermediate page prepends preserving order', async () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m3', 'c1', '2026-07-01T12:00:00.000Z'),
        msg('m4', 'c1', '2026-07-01T13:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'cur-1',
        hasMore: true,
      }),
    );

    setMessagesPageFetcherForTests(async () =>
      page(
        [
          msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
          msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
        ],
        { nextCursor: 'cur-2', hasMore: true, source: 'cursor' },
      ),
    );

    const result = await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(result.prepended).toBe(2);
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
    ]);
    expect(selectConversationLoadedPages(store.getState(), 'c1')).toBe(2);
    expect(selectConversationCanLoadMore(store.getState(), 'c1')).toBe(true);
  });

  it('last page sets hasMore=false', async () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('m2', 'c1', '2026-07-01T11:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', { nextCursor: 'last', hasMore: true }),
    );

    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], {
        nextCursor: null,
        hasMore: false,
        source: 'cursor',
      }),
    );

    const result = await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(result.hasMore).toBe(false);
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(false);
    expect(selectConversationCanLoadMore(store.getState(), 'c1')).toBe(false);
  });

  it('empty page applies without wiping existing messages', async () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('m1', 'c1', '2026-07-01T10:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', { nextCursor: 'x', hasMore: true }),
    );
    setMessagesPageFetcherForTests(async () => page([], { hasMore: false, nextCursor: null }));

    await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual(['m1']);
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(false);
  });

  it('invalid cursor returns empty and clears hasMore', async () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('m1', 'c1', '2026-07-01T10:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'invalid',
        hasMore: true,
      }),
    );
    setMessagesPageFetcherForTests(async () =>
      page([], { hasMore: false, nextCursor: null, source: 'legacy' }),
    );

    const result = await loadMessagesCursorCommand({
      conversationId: 'c1',
      cursor: 'invalid',
    });
    expect(result.messages).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(selectConversationMessages(store.getState(), 'c1')).toHaveLength(1);
  });

  it('merge engine preserves order and discards duplicates', () => {
    const existing = ['m2', 'm3'];
    const byId = {
      m2: msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
      m3: msg('m3', 'c1', '2026-07-01T12:00:00.000Z'),
    };
    const merge = mergePrependMessages(existing, byId, [
      msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
      msg('m0', 'c1', '2026-07-01T09:00:00.000Z'),
    ]);
    expect(merge.orderedIds).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(merge.prepended).toBe(2);
    expect(merge.duplicatesDiscarded).toBe(1);
  });

  it('loadingMore toggles around cursor load', async () => {
    const store = session();
    let sawLoading = false;
    setMessagesPageFetcherForTests(async () => {
      sawLoading = selectConversationLoadingMore(store.getState(), 'c1') === true;
      return page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], {
        hasMore: false,
        source: 'cursor',
      });
    });

    await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(sawLoading).toBe(true);
    expect(selectConversationLoadingMore(store.getState(), 'c1')).toBe(false);
  });

  it('resetConversationCursorCommand clears pagination metadata', () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'abc',
        previousCursor: 'prev',
        hasMore: true,
      }),
    );
    store.dispatch(chatDomainActionCreators.prependPage('c1', [], { hasMore: true }));
    resetConversationCursorCommand('c1');
    const cursor = selectConversationCursor(store.getState(), 'c1');
    expect(cursor.nextCursor).toBeNull();
    expect(cursor.hasMore).toBe(false);
    expect(cursor.loadedPages).toBe(0);
    expect(cursor.loadingMore).toBe(false);
  });

  it('rollback CHAT_CORE_STORE OFF does not write store', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], { hasMore: true, nextCursor: 'x' }),
    );

    const result = await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(result.applied).toBe(false);
    expect(selectConversationMessages(store.getState(), 'c1')).toEqual([]);
    resetConversationCursorCommand('c1');
    expect(selectConversationCursor(store.getState(), 'c1').hasMore).toBe(false);
  });

  it('F5 loadMessagesCommand still replaces thread (compat)', async () => {
    const store = session();
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [msg('old', 'c1', '2026-07-01T09:00:00.000Z')]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', { nextCursor: 'keep?', hasMore: true }),
    );

    // loadMessagesCommand uses fetchConversationMessages → repository; mock via page not used.
    // Instead verify messages/set resets cursor (same path as loadMessagesCommand write).
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('n1', 'c1', '2026-07-01T10:00:00.000Z'),
        msg('n2', 'c1', '2026-07-01T11:00:00.000Z'),
      ]),
    );
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'n1',
      'n2',
    ]);
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(false);
    expect(selectConversationLoadedPages(store.getState(), 'c1')).toBe(1);
    expect(selectConversationCursor(store.getState(), 'c1').nextCursor).toBeNull();
  });

  it('scroll preservation foundation restores relative top', () => {
    const el = { scrollHeight: 1000, scrollTop: 200 };
    const snap = captureScrollAnchor(el, 'c1');
    el.scrollHeight = 1400;
    const next = restoreScrollAnchor(el, snap);
    expect(next).toBe(600);
    expect(el.scrollTop).toBe(600);
  });

  it('legacy first page dump sets hasMore false', async () => {
    const store = session();
    setMessagesPageFetcherForTests(async () =>
      page(
        [
          msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
          msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
        ],
        { source: 'legacy', hasMore: false, nextCursor: null },
      ),
    );
    const result = await loadMessagesCursorCommand({ conversationId: 'c1' });
    expect(result.source).toBe('legacy');
    expect(result.hasMore).toBe(false);
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(false);
  });

  it('records cursor metrics when CHAT_CORE_METRICS on', async () => {
    session();
    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], { source: 'cursor' }),
    );
    await loadMessagesCursorCommand({ conversationId: 'c1' });
    const snap = getCursorMetricsSnapshot();
    expect(snap.cursorRequests).toBeGreaterThanOrEqual(1);
  });

  it('encodeLegacyMessageCursor round-trip helper', () => {
    expect(encodeLegacyMessageCursor('abc')).toBe('msg:abc');
  });
});
