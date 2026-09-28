/**
 * F6.1 — Incremental Load More.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  selectConversationMessages,
  selectConversationHasMore,
  selectConversationCanLoadMore,
  selectConversationCursor,
  captureScrollAnchor,
  restoreScrollAnchor,
  resetScrollAnchorsForTests,
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
import {
  getLoadMoreMetricsSnapshot,
  resetLoadMoreMetrics,
  recordLoadMoreClick,
  recordLoadMorePage,
} from '../metrics/loadMoreMetrics';
import { chatDomainActionCreators } from './actions';
import { getChatDomainStoreSession } from './session';
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

describe('F6.1 incremental load more', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesStateForTests();
    resetLoadMessagesCursorStateForTests();
    resetLoadMoreMetrics();
    resetScrollAnchorsForTests();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    setMessagesPageFetcherForTests(null);
    resetLoadMessagesStateForTests();
    resetLoadMessagesCursorStateForTests();
    resetLoadMoreMetrics();
    resetScrollAnchorsForTests();
  });

  it('first open loads latest page and sets hasMore', async () => {
    const all = [
      msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
      msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
      msg('m3', 'c1', '2026-07-01T12:00:00.000Z'),
    ];
    setMessagesPageFetcherForTests(async (params) => {
      if (params.latestPage && !params.cursor) {
        return page([all[1]!, all[2]!], {
          nextCursor: encodeCursor('m2'),
          hasMore: true,
          source: 'legacy',
        });
      }
      return page([]);
    });

    await loadMessagesCommand('c1');
    const state = getChatDomainStoreSession()!.getState();
    expect(selectConversationMessages(state, 'c1').map((m) => m.id)).toEqual(['m2', 'm3']);
    expect(selectConversationHasMore(state, 'c1')).toBe(true);
    expect(selectConversationCanLoadMore(state, 'c1')).toBe(true);
  });

  it('first Load More prepends older page', async () => {
    const store = getChatDomainStoreSession()!;
    // Seed latest page
    setMessagesPageFetcherForTests(async () =>
      page([msg('m3', 'c1', '2026-07-01T12:00:00.000Z'), msg('m4', 'c1', '2026-07-01T13:00:00.000Z')], {
        nextCursor: 'cur-older',
        hasMore: true,
        source: 'cursor',
      }),
    );
    await loadMessagesCommand('c1');

    setMessagesPageFetcherForTests(async (params) => {
      expect(params.cursor).toBe('cur-older');
      return page(
        [msg('m1', 'c1', '2026-07-01T10:00:00.000Z'), msg('m2', 'c1', '2026-07-01T11:00:00.000Z')],
        { nextCursor: 'cur-oldest', hasMore: true, source: 'cursor' },
      );
    });

    const result = await loadMessagesCursorCommand({
      conversationId: 'c1',
      cursor: 'cur-older',
    });
    expect(result.prepended).toBe(2);
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
    ]);
  });

  it('multiple pages then last page', async () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m5', 'c1', '2026-07-01T14:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'p1',
        hasMore: true,
      }),
    );

    setMessagesPageFetcherForTests(async () =>
      page([msg('m3', 'c1', '2026-07-01T12:00:00.000Z'), msg('m4', 'c1', '2026-07-01T13:00:00.000Z')], {
        nextCursor: 'p2',
        hasMore: true,
      }),
    );
    await loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'p1' });
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(true);

    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z'), msg('m2', 'c1', '2026-07-01T11:00:00.000Z')], {
        nextCursor: null,
        hasMore: false,
      }),
    );
    await loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'p2' });
    expect(selectConversationHasMore(store.getState(), 'c1')).toBe(false);
    expect(selectConversationCanLoadMore(store.getState(), 'c1')).toBe(false);
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
    ]);
  });

  it('hasMore=false hides load path (canLoadMore false)', async () => {
    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], { hasMore: false }),
    );
    await loadMessagesCommand('c1');
    expect(selectConversationHasMore(getChatDomainStoreSession()!.getState(), 'c1')).toBe(false);
    expect(selectConversationCanLoadMore(getChatDomainStoreSession()!.getState(), 'c1')).toBe(
      false,
    );
  });

  it('loadingMore blocks concurrent duplicate via inFlight', async () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'c',
        hasMore: true,
      }),
    );

    let resolveFetch!: (v: MessagesPageResult) => void;
    setMessagesPageFetcherForTests(
      () =>
        new Promise<MessagesPageResult>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const p1 = loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'c' });
    const p2 = loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'c' });
    resolveFetch(
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], { hasMore: false, nextCursor: null }),
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(selectConversationMessages(store.getState(), 'c1')).toHaveLength(2);
  });

  it('merge preserves order without duplicates', async () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
        msg('m3', 'c1', '2026-07-01T12:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'x',
        hasMore: true,
      }),
    );
    setMessagesPageFetcherForTests(async () =>
      page(
        [
          msg('m1', 'c1', '2026-07-01T10:00:00.000Z'),
          msg('m2', 'c1', '2026-07-01T11:00:00.000Z'),
        ],
        { hasMore: false },
      ),
    );
    const result = await loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'x' });
    expect(result.duplicatesDiscarded).toBe(1);
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('scroll preservation restores relative position', () => {
    const el = { scrollHeight: 800, scrollTop: 100 };
    const snap = captureScrollAnchor(el, 'c1');
    el.scrollHeight = 1200;
    expect(restoreScrollAnchor(el, snap)).toBe(500);
  });

  it('rollback CHAT_CORE_STORE OFF does not write', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], { hasMore: true, nextCursor: 'x' }),
    );
    const result = await loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'x' });
    expect(result.applied).toBe(false);
    expect(selectConversationMessages(store.getState(), 'c1')).toEqual([]);
  });

  it('F6.0 cursor selectors remain compatible after initial load', async () => {
    setMessagesPageFetcherForTests(async () =>
      page([msg('m1', 'c1', '2026-07-01T10:00:00.000Z')], {
        nextCursor: 'n1',
        hasMore: true,
        source: 'cursor',
      }),
    );
    await loadMessagesCommand('c1');
    const cursor = selectConversationCursor(getChatDomainStoreSession()!.getState(), 'c1');
    expect(cursor.nextCursor).toBe('n1');
    expect(cursor.hasMore).toBe(true);
    expect(cursor.loadedPages).toBe(1);
  });

  it('loadMore metrics record when CHAT_CORE_METRICS on', () => {
    recordLoadMoreClick();
    recordLoadMorePage(5, 12);
    const snap = getLoadMoreMetricsSnapshot();
    expect(snap.loadMoreClicks).toBe(1);
    expect(snap.pagesLoaded).toBe(1);
    expect(snap.messagesPrepended).toBe(5);
  });

  it('does not replace entire thread on load more', async () => {
    const store = getChatDomainStoreSession()!;
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        msg('keep', 'c1', '2026-07-01T12:00:00.000Z'),
      ]),
    );
    store.dispatch(
      chatDomainActionCreators.setMessageCursor('c1', {
        nextCursor: 'c',
        hasMore: true,
      }),
    );
    setMessagesPageFetcherForTests(async () =>
      page([msg('old', 'c1', '2026-07-01T10:00:00.000Z')], { hasMore: false }),
    );
    await loadMessagesCursorCommand({ conversationId: 'c1', cursor: 'c' });
    expect(selectConversationMessages(store.getState(), 'c1').map((m) => m.id)).toEqual([
      'old',
      'keep',
    ]);
  });
});
