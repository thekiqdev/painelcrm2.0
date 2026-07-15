/**
 * F5.9 — Command Unification (único pipeline loadInbox).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadInboxCommand,
  clearInboxCommand,
  resetLoadInboxStateForTests,
  getLoadInboxGenerationForTests,
} from '../core/loadInbox';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  getChatDomainStoreSession,
  selectChatConversationsForUi,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatConversation } from '@/services/chat';
import type { ChatConversationsListResult } from '@/repositories/chatConversationsRepository';

const legacyConversation = (id: string, preview?: string): ChatConversation =>
  ({
    id,
    user_id: 'u1',
    external_chat_id: `${id}@s.whatsapp.net`,
    instance_id: 'inst-1',
    contactName: `Contact ${id}`,
    lastMessagePreview: preview ?? `preview-${id}`,
    lastMessageAt: '2026-07-09T12:00:00.000Z',
    unreadCount: 0,
  }) as ChatConversation;

const mockItems = (ids: string[]) => ids.map((id) => legacyConversation(id));

function pageOf(
  items: ChatConversation[],
  meta?: Partial<ChatConversationsListResult>,
): ChatConversationsListResult {
  return {
    items,
    nextCursor: meta?.nextCursor ?? null,
    hasMore: meta?.hasMore ?? false,
    source: meta?.source ?? 'aggregated',
  };
}

vi.mock('../core/inboxFetch', () => ({
  fetchInboxConversations: vi.fn(async () => []),
  fetchInboxConversationsPage: vi.fn(async (params: { surface?: string }) => {
    const n = params.surface === 'float' ? 3 : 50;
    return {
      items: mockItems(Array.from({ length: n }, (_, i) => `conv-${i}`)),
      nextCursor: null,
      hasMore: false,
      source: 'aggregated' as const,
    };
  }),
}));

describe('F5.9 command unification', () => {
  beforeEach(async () => {
    resetChatMigrationFlagsToDefaults();
    resetLoadInboxStateForTests();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    const { fetchInboxConversationsPage } = await import('../core/inboxFetch');
    vi.mocked(fetchInboxConversationsPage).mockImplementation(async (params) => {
      const n = params.surface === 'float' ? 3 : 50;
      return pageOf(mockItems(Array.from({ length: n }, (_, i) => `conv-${i}`)));
    });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetLoadInboxStateForTests();
    setChatDomainStoreSessionForTests(null);
    vi.clearAllMocks();
  });

  it('Chat surface hydrates store via loadInboxCommand', async () => {
    const result = await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
      quickFilter: 'all',
    });
    expect(result.applied).toBe(true);
    expect(result.stale).toBe(false);
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(50);
  });

  it('Floating surface uses same command', async () => {
    const result = await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'float',
      quickFilter: 'all',
    });
    expect(result.applied).toBe(true);
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(3);
  });

  it('concurrency — last generation wins', async () => {
    const { fetchInboxConversationsPage } = await import('../core/inboxFetch');
    let resolveFirst: (v: ChatConversationsListResult) => void;
    const firstPromise = new Promise<ChatConversationsListResult>((r) => {
      resolveFirst = r;
    });
    vi.mocked(fetchInboxConversationsPage)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => pageOf(mockItems(['only-last'])));

    const p1 = loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
    });
    const p2 = loadInboxCommand({
      instanceIds: ['inst-2'],
      inboxScope: 'tenant',
      surface: 'chat',
    });

    const r2 = await p2;
    expect(r2.applied).toBe(true);
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState()).map((c) => c.id)).toEqual([
      'only-last',
    ]);

    resolveFirst!(
      pageOf(mockItems(Array.from({ length: 50 }, (_, i) => `stale-${i}`))),
    );
    const r1 = await p1;
    expect(r1.stale).toBe(true);
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState()).map((c) => c.id)).toEqual([
      'only-last',
    ]);
  });

  it('does not wipe store with empty fetch unless allowEmpty', async () => {
    const { fetchInboxConversationsPage } = await import('../core/inboxFetch');
    vi.mocked(fetchInboxConversationsPage).mockResolvedValueOnce(pageOf(mockItems(['keep-1', 'keep-2'])));

    await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
    });
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(2);

    vi.mocked(fetchInboxConversationsPage).mockResolvedValueOnce(pageOf([]));
    const empty = await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
      force: true,
    });
    expect(empty.applied).toBe(false);
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(2);
  });

  it('clearInboxCommand clears store', async () => {
    await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
    });
    clearInboxCommand();
    expect(selectChatConversationsForUi(getChatDomainStoreSession()!.getState())).toHaveLength(0);
    expect(getLoadInboxGenerationForTests()).toBeGreaterThan(0);
  });

  it('parity — chat and float same context share orderedIds', async () => {
    const { fetchInboxConversationsPage } = await import('../core/inboxFetch');
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue(pageOf(mockItems(['a', 'b', 'c'])));

    await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
      quickFilter: 'all',
    });
    const afterChat = selectChatConversationsForUi(getChatDomainStoreSession()!.getState()).map(
      (c) => c.id,
    );

    await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'float',
      quickFilter: 'all',
      force: true,
    });
    const afterFloat = selectChatConversationsForUi(getChatDomainStoreSession()!.getState()).map(
      (c) => c.id,
    );

    expect(afterChat).toEqual(['a', 'b', 'c']);
    expect(afterFloat).toEqual(afterChat);
  });

  it('CHAT_CORE_STORE OFF does not write store', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    const result = await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      surface: 'chat',
    });
    expect(result.items.length).toBe(50);
    expect(result.applied).toBe(false);
    expect(getChatDomainStoreSession()?.getState().conversations.orderedIds ?? []).toEqual([]);
  });
});
