/**
 * TF7 E2 — freshness TTL longo, skip GET, force bypass, seed pós-warm.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadInboxCommand,
  resetLoadInboxStateForTests,
  markInboxFreshFromClient,
  getEffectiveInboxFreshTtlMs,
  isChatRealtimeConnectedForInboxFresh,
  INBOX_FRESH_TTL_MS,
  INBOX_FRESH_TTL_DISCONNECTED_MS,
} from '../core/loadInbox';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  getChatDomainStoreSession,
} from '../store/index';
import { applyStoreConversationList } from '../store/consolidation';
import { selectConversationsForUi } from '../store/conversationSelectors';
import { chatRealtimeBridge } from '../realtime/bridge';

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

describe('TF7 E2 inbox fresh TTL', () => {
  beforeEach(() => {
    resetLoadInboxStateForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
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

  it('constants: fresh 5min, disconnected 30s', () => {
    expect(INBOX_FRESH_TTL_MS).toBe(5 * 60_000);
    expect(INBOX_FRESH_TTL_DISCONNECTED_MS).toBe(30_000);
  });

  it('skip GET while fresh (same session)', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await loadInboxCommand(baseParams);
    // Em testes o bridge não está connected → TTL=30s; avançar 20s ainda é fresco.
    vi.advanceTimersByTime(20_000);
    const second = await loadInboxCommand(baseParams);

    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cache');
  });

  it('force: true always fetches', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await loadInboxCommand(baseParams);
    await loadInboxCommand({ ...baseParams, force: true });
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(2);
  });

  it('after fresh TTL expires → fetches again', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await loadInboxCommand(baseParams);
    // disconnected TTL in tests (bridge not connected) = 30s
    const ttl = getEffectiveInboxFreshTtlMs();
    expect(ttl).toBe(INBOX_FRESH_TTL_DISCONNECTED_MS);
    vi.advanceTimersByTime(ttl + 1);
    await loadInboxCommand(baseParams);
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(2);
  });

  it('Chat+Float share freshness (surface omitted from key)', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await loadInboxCommand({ ...baseParams, surface: 'chat' });
    const floatResult = await loadInboxCommand({ ...baseParams, surface: 'float' });

    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
    expect(floatResult.source).toBe('cache');
  });

  it('markInboxFreshFromClient seeds skip without prior network in this process', async () => {
    applyStoreConversationList([legacy('warmed', '2026-07-16T11:00:00.000Z')]);
    const seeded = markInboxFreshFromClient(baseParams, Date.now() - 5_000);
    expect(seeded).toBe(true);

    const result = await loadInboxCommand(baseParams);
    expect(fetchInboxConversationsPage).not.toHaveBeenCalled();
    expect(result.source).toBe('cache');
  });

  it('markInboxFreshFromClient ignores stale disk timestamp', () => {
    applyStoreConversationList([legacy('warmed', '2026-07-16T11:00:00.000Z')]);
    const staleAt = Date.now() - INBOX_FRESH_TTL_MS - 1;
    expect(markInboxFreshFromClient(baseParams, staleAt)).toBe(false);
  });

  it('isChatRealtimeConnectedForInboxFresh is false in unit tests by default', () => {
    expect(chatRealtimeBridge.status === 'connected').toBe(false);
    expect(isChatRealtimeConnectedForInboxFresh()).toBe(false);
    expect(getEffectiveInboxFreshTtlMs()).toBe(INBOX_FRESH_TTL_DISCONNECTED_MS);
  });

  it('reapplies cached items to Store when switching attendance filters (Fila ↔ Minhas)', async () => {
    vi.mocked(fetchInboxConversationsPage)
      .mockResolvedValueOnce({
        items: [legacy('mine-1', '2026-07-16T12:00:00.000Z')],
        nextCursor: null,
        hasMore: false,
        source: 'aggregated',
      })
      .mockResolvedValueOnce({
        items: [legacy('queue-1', '2026-07-16T12:01:00.000Z')],
        nextCursor: null,
        hasMore: false,
        source: 'aggregated',
      });

    await loadInboxCommand({ ...baseParams, attendanceFilter: 'mine' });
    expect(selectConversationsForUi(getChatDomainStoreSession()!.getState()).map((c) => c.id)).toEqual([
      'mine-1',
    ]);

    await loadInboxCommand({ ...baseParams, attendanceFilter: 'queue' });
    expect(selectConversationsForUi(getChatDomainStoreSession()!.getState()).map((c) => c.id)).toEqual([
      'queue-1',
    ]);

    // Voltar a Minhas dentro do TTL — skip GET mas Store deve voltar a mine-1
    const backToMine = await loadInboxCommand({ ...baseParams, attendanceFilter: 'mine' });
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(2);
    expect(backToMine.source).toBe('cache');
    expect(backToMine.applied).toBe(true);
    expect(selectConversationsForUi(getChatDomainStoreSession()!.getState()).map((c) => c.id)).toEqual([
      'mine-1',
    ]);
  });

  it('attendance filter empty result clears Store (allowEmpty implícito)', async () => {
    vi.mocked(fetchInboxConversationsPage)
      .mockResolvedValueOnce({
        items: [legacy('mine-1', '2026-07-16T12:00:00.000Z')],
        nextCursor: null,
        hasMore: false,
        source: 'aggregated',
      })
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false,
        source: 'aggregated',
      });

    await loadInboxCommand({ ...baseParams, attendanceFilter: 'mine' });
    const emptyQueue = await loadInboxCommand({
      ...baseParams,
      attendanceFilter: 'queue',
      force: true,
    });

    expect(emptyQueue.applied).toBe(true);
    expect(selectConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(0);
  });
});
