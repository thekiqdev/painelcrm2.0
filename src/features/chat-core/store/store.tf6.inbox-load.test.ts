/**
 * TF6 — inbox limit=50, TTL coalesce, append page meta.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadInboxCommand,
  loadMoreInboxCommand,
  resetLoadInboxStateForTests,
  INBOX_LOAD_TTL_MS,
} from '../core/loadInbox';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from '../store/index';
import { getChatDomainStoreSession } from '../store/session';
import { selectConversationIds } from '../store/conversationSelectors';

vi.mock('../core/inboxFetch', () => ({
  fetchInboxConversationsPage: vi.fn(),
  fetchInboxConversations: vi.fn(),
}));

import { fetchInboxConversationsPage } from '../core/inboxFetch';

function legacy(id: string, at: string) {
  return {
    id,
    user_id: 'u1',
    external_chat_id: id,
    unreadCount: 0,
    lastMessageAt: at,
    lastMessagePreview: 'x',
  } as import('@/services/chat').ChatConversation;
}

describe('TF6 inbox load pressure', () => {
  beforeEach(() => {
    resetLoadInboxStateForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    vi.mocked(fetchInboxConversationsPage).mockReset();
  });

  afterEach(() => {
    setChatDomainStoreSessionForTests(null);
    resetChatMigrationFlagsToDefaults();
    resetLoadInboxStateForTests();
  });

  it('first page requests default limit 50 and stores hasMore', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-15T12:00:00.000Z')],
      nextCursor: 'cur-next',
      hasMore: true,
      source: 'aggregated',
    });

    const result = await loadInboxCommand({
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      inboxScope: 'tenant',
      surface: 'chat',
    });

    expect(fetchInboxConversationsPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('cur-next');
    expect(result.applied).toBe(true);
  });

  it('TTL returns cache without second fetch', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-15T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    const params = {
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      inboxScope: 'tenant' as const,
      surface: 'chat' as const,
    };

    await loadInboxCommand(params);
    const second = await loadInboxCommand(params);

    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cache');
    expect(second.applied).toBe(false);
  });

  it('force bypasses TTL', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-15T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    const params = {
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      inboxScope: 'tenant' as const,
      surface: 'chat' as const,
    };

    await loadInboxCommand(params);
    await loadInboxCommand({ ...params, force: true });
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(2);
  });

  it('loadMore appends without dropping first page', async () => {
    vi.mocked(fetchInboxConversationsPage)
      .mockResolvedValueOnce({
        items: [
          legacy('a', '2026-07-15T12:00:00.000Z'),
          legacy('b', '2026-07-15T11:00:00.000Z'),
        ],
        nextCursor: 'page2',
        hasMore: true,
        source: 'aggregated',
      })
      .mockResolvedValueOnce({
        items: [legacy('c', '2026-07-15T10:00:00.000Z')],
        nextCursor: null,
        hasMore: false,
        source: 'aggregated',
      });

    const params = {
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      inboxScope: 'tenant' as const,
      surface: 'chat' as const,
    };

    await loadInboxCommand(params);
    const more = await loadMoreInboxCommand(params);

    expect(more.hasMore).toBe(false);
    const session = getChatDomainStoreSession();
    expect(selectConversationIds(session!.getState()).sort()).toEqual(['a', 'b', 'c'].sort());
  });

  it('INBOX_LOAD_TTL_MS is 20s', () => {
    expect(INBOX_LOAD_TTL_MS).toBe(20_000);
  });
});
