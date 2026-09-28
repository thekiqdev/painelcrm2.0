/**
 * TF8 E1 — seed disk TTL 5min (WS down) + soft reconcile on connect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadInboxCommand,
  resetLoadInboxStateForTests,
  markInboxFreshFromClient,
  scheduleInboxSoftReconcileOnRealtimeConnected,
  getPendingInboxSoftReconcileForTests,
  flushInboxSoftReconcileForTests,
  INBOX_FRESH_TTL_MS,
  INBOX_FRESH_TTL_DISCONNECTED_MS,
} from '../core/loadInbox';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from './index';
import { applyStoreConversationList } from './consolidation';

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

const baseParams = {
  instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  inboxScope: 'tenant' as const,
  surface: 'chat' as const,
};

describe('TF8 E1 F5 disk seed + soft reconcile', () => {
  beforeEach(() => {
    resetLoadInboxStateForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    vi.mocked(fetchInboxConversationsPage).mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    setChatDomainStoreSessionForTests(null);
    resetChatMigrationFlagsToDefaults();
    resetLoadInboxStateForTests();
  });

  it('disk seed succeeds with age > disconnected TTL but < 5min (WS down)', () => {
    applyStoreConversationList([legacy('c1', '2026-07-16T11:00:00.000Z')]);
    // age 60s > 30s disconnected, < 5min fresh
    const at = Date.now() - 60_000;
    expect(INBOX_FRESH_TTL_DISCONNECTED_MS).toBe(30_000);
    expect(markInboxFreshFromClient(baseParams, at)).toBe(true);
  });

  it('disk seed rejects age >= INBOX_FRESH_TTL_MS', () => {
    applyStoreConversationList([legacy('c1', '2026-07-16T11:00:00.000Z')]);
    const at = Date.now() - INBOX_FRESH_TTL_MS - 1;
    expect(markInboxFreshFromClient(baseParams, at)).toBe(false);
  });

  it('seed + skip GET without network (WS down)', async () => {
    applyStoreConversationList([legacy('c1', '2026-07-16T11:00:00.000Z')]);
    expect(markInboxFreshFromClient(baseParams, Date.now() - 60_000)).toBe(true);

    const result = await loadInboxCommand(baseParams);
    expect(fetchInboxConversationsPage).not.toHaveBeenCalled();
    expect(result.source).toBe('cache');
  });

  it('schedule soft reconcile while WS down; flush forces one GET', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    applyStoreConversationList([legacy('warmed', '2026-07-16T11:00:00.000Z')]);
    markInboxFreshFromClient(baseParams, Date.now() - 10_000);
    scheduleInboxSoftReconcileOnRealtimeConnected(baseParams);

    expect(getPendingInboxSoftReconcileForTests()).not.toBeNull();

    await loadInboxCommand(baseParams);
    expect(fetchInboxConversationsPage).not.toHaveBeenCalled();

    flushInboxSoftReconcileForTests();
    // force is async
    await vi.waitFor(() => {
      expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
    });
    expect(getPendingInboxSoftReconcileForTests()).toBeNull();
  });
});
