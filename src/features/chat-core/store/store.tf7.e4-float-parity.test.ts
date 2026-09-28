/**
 * TF7 E4 — chave alinhada Chat↔Float, cap mirror, diag events.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildDefaultChatPageInboxFiltersKey,
  buildChatPageFiltersKey,
  clearChatPageCacheForSession,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { INBOX_PAGE_CACHE_MIRROR_MAX } from '../core/inboxPageCacheMirror';
import { logInboxCacheEvent } from '../core/inboxCacheDiag';
import {
  loadInboxCommand,
  resetLoadInboxStateForTests,
} from '../core/loadInbox';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from './index';

vi.mock('../core/inboxFetch', () => ({
  fetchInboxConversationsPage: vi.fn(),
  fetchInboxConversations: vi.fn(),
}));

import { fetchInboxConversationsPage } from '../core/inboxFetch';

describe('TF7 E4 float parity + diag', () => {
  const scope: ChatPageCacheScope = { tenantId: 't1', userId: 'u1' };

  beforeEach(() => {
    resetLoadInboxStateForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    clearChatPageCacheForSession(scope);
    setChatDomainStoreSessionForTests(createChatDomainStore());
    vi.mocked(fetchInboxConversationsPage).mockReset();
  });

  afterEach(() => {
    clearChatPageCacheForSession(scope);
    setChatDomainStoreSessionForTests(null);
    resetChatMigrationFlagsToDefaults();
    resetLoadInboxStateForTests();
  });

  it('buildDefaultChatPageInboxFiltersKey matches Chat defaults shape', () => {
    const fromHelper = buildDefaultChatPageInboxFiltersKey({
      tenantId: 't1',
      inboxScope: 'tenant',
      instanceIds: ['b', 'a'],
    });
    const fromChatShape = buildChatPageFiltersKey({
      tenant: 't1',
      inbox: 'tenant',
      attendance: '',
      channel: 'all',
      listFilter: 'all',
      instances: 'a,b',
    });
    expect(fromHelper).toBe(fromChatShape);
  });

  it('INBOX_PAGE_CACHE_MIRROR_MAX remains 50 (cap explícito)', () => {
    expect(INBOX_PAGE_CACHE_MIRROR_MAX).toBe(50);
  });

  it('logInboxCacheEvent does not throw when diag off', () => {
    expect(() =>
      logInboxCacheEvent('inbox_warm_hit', { conversationCount: 1 }),
    ).not.toThrow();
  });

  it('Chat then Float share freshness (one network fetch)', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [
        {
          id: 'c1',
          user_id: 'u1',
          external_chat_id: 'c1',
          unreadCount: 0,
          lastMessageAt: '2026-07-16T12:00:00.000Z',
          lastMessagePreview: 'x',
        } as import('@/services/chat').ChatConversation,
      ],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    const base = {
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      inboxScope: 'tenant' as const,
    };

    await loadInboxCommand({ ...base, surface: 'chat' });
    const floatResult = await loadInboxCommand({ ...base, surface: 'float' });
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
    expect(floatResult.source).toBe('cache');
  });
});
