import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { applyStoreConversationList } from './consolidation';
import {
  createChatDomainStore,
  syncStoreFromSocketEvent,
  selectConversationById,
  selectConversationIds,
  selectConversationPreview,
  selectConversationOrdering,
  selectConversationsForUi,
  sortDomainConversations,
  recordFloatingConversationRender,
  resetFloatingConversationMetrics,
  getFloatingConversationMetricsSnapshot,
  setChatDomainStoreSessionForTests,
  shouldUseChatDomainStore,
  getChatDomainStoreSession,
} from './index';
import { compareFloatingConversationParity } from './shadowValidation';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyConversationToDomain } from './domainMappers';
import { mapDomainEventToActions } from './eventAppliers';
import type { ChatDomainConversation } from '../domain/types';
import type { ChatConversation } from '@/services/chat';

const legacyConversation = (
  id: string,
  patch: Partial<ChatConversation> & { unread_count?: number; last_message_preview?: string } = {},
): ChatConversation => {
  const unread =
    typeof patch.unread_count === 'number'
      ? patch.unread_count
      : typeof patch.unreadCount === 'number'
        ? patch.unreadCount
        : 0;
  return {
    id,
    user_id: 'u1',
    external_chat_id: `55${id}`,
    lastMessageAt: '2026-07-08T10:00:00.000Z',
    ...patch,
    unread_count: unread,
    unreadCount: unread,
    last_message_preview:
      typeof patch.last_message_preview === 'string'
        ? patch.last_message_preview
        : `preview-${id}`,
  } as ChatConversation;
};

const domainFromLegacy = (raw: ChatConversation): ChatDomainConversation =>
  mapLegacyConversationToDomain(raw);

vi.mock('@/repositories/chatConversationsRepository', () => ({
  listChatConversations: vi.fn(async () => ({
    items: [
      {
        id: 'conv-1',
        user_id: 'u1',
        external_chat_id: '5511999999999',
        unread_count: 2,
        lastMessageAt: '2026-07-08T10:00:00.000Z',
      },
      {
        id: 'conv-2',
        user_id: 'u1',
        external_chat_id: '5511888888888',
        unread_count: 0,
        lastMessageAt: '2026-07-08T09:00:00.000Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
    source: 'aggregated' as const,
  })),
  listChatConversationsItems: vi.fn(async () => [
    {
      id: 'conv-1',
      user_id: 'u1',
      external_chat_id: '5511999999999',
      unread_count: 2,
      lastMessageAt: '2026-07-08T10:00:00.000Z',
    },
    {
      id: 'conv-2',
      user_id: 'u1',
      external_chat_id: '5511888888888',
      unread_count: 0,
      lastMessageAt: '2026-07-08T09:00:00.000Z',
    },
  ]),
}));

describe('chat-core F5.2 floating conversation list', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetFloatingConversationMetrics();
    setChatDomainStoreSessionForTests(null);
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetFloatingConversationMetrics();
  });

  it('selectConversation selectors expose list, ids, preview and ordering', () => {
    const store = createChatDomainStore();
    const rows = [
      domainFromLegacy(legacyConversation('c1', { unreadCount: 1 })),
      domainFromLegacy(legacyConversation('c2', { unreadCount: 0 })),
    ];
    store.dispatch({ type: 'conversations/set', conversations: rows });

    const state = store.getState();
    expect(selectConversationById(state, 'c1')?.id).toBe('c1');
    expect(selectConversationIds(state)).toEqual(['c1', 'c2']);
    expect(selectConversationPreview(state, 'c1')).toMatchObject({
      conversationId: 'c1',
      unreadCount: 1,
    });
    expect(selectConversationOrdering(state).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(selectConversationsForUi(state).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('sortDomainConversations orders pinned first then lastMessageAt', () => {
    const pinned = domainFromLegacy(
      legacyConversation('pinned', {
        lastMessageAt: '2026-07-08T09:00:00.000Z',
      }),
    );
    pinned.raw = { ...(pinned.raw as ChatConversation), pinned: true };
    const recent = domainFromLegacy(
      legacyConversation('recent', {
        lastMessageAt: '2026-07-08T11:00:00.000Z',
      }),
    );
    const ordered = sortDomainConversations([recent, pinned]);
    expect(ordered.map((c) => c.id)).toEqual(['pinned', 'recent']);
  });

  it('selectConversationOrdering filters unread quick filter', () => {
    const store = createChatDomainStore();
    store.dispatch({
      type: 'conversations/set',
      conversations: [
        domainFromLegacy(legacyConversation('u1', { unreadCount: 3 })),
        domainFromLegacy(legacyConversation('u0', { unreadCount: 0 })),
      ],
    });
    const unread = selectConversationOrdering(store.getState(), { quickFilter: 'unread' });
    expect(unread.map((c) => c.id)).toEqual(['u1']);
  });

  it('renders conversation list from store after command sync', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    const items = [
      legacyConversation('conv-a', { unreadCount: 4 }),
      legacyConversation('conv-b', { unreadCount: 1 }),
    ];
    applyStoreConversationList(items);

    const ui = selectConversationsForUi(store.getState());
    expect(ui.map((c) => c.id)).toEqual(['conv-a', 'conv-b']);
    expect(ui[0]?.unreadCount).toBe(4);
  });

  it('updates list on realtime conversation.updated', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    applyStoreConversationList([
      legacyConversation('conv-1', { unread_count: 1, last_message_preview: 'before' }),
    ]);

    const updated = domainFromLegacy(
      legacyConversation('conv-1', { unread_count: 5, last_message_preview: 'updated' }),
    );
    expect(mapDomainEventToActions({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: { conversation: legacyConversation('conv-1', { unread_count: 5, last_message_preview: 'updated' }) },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    })).toHaveLength(1);

    store.dispatch({ type: 'conversations/upsert', conversation: updated });

    const preview = selectConversationPreview(store.getState(), 'conv-1');
    expect(preview?.unreadCount).toBe(5);
    expect(preview?.lastMessagePreview).toBe('updated');
  });

  it('removes conversation on realtime conversation.deleted', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    applyStoreConversationList([
      legacyConversation('conv-1'),
      legacyConversation('conv-2'),
    ]);

    syncStoreFromSocketEvent({
      kind: 'conversation.deleted',
      protocol: 'v2',
      payload: { conversation_id: 'conv-1' },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });

    expect(selectConversationIds(store.getState())).toEqual(['conv-2']);
  });

  it('compareFloatingConversationParity validates count, ids, unread and pinned', () => {
    const repository = [
      legacyConversation('a', { unreadCount: 2, pinned: true }),
      legacyConversation('b', { unreadCount: 0, pinned: false }),
    ];
    const store = [
      legacyConversation('a', { unreadCount: 2, pinned: true }),
      legacyConversation('b', { unreadCount: 0, pinned: false }),
    ];
    const ok = compareFloatingConversationParity({
      repositoryConversations: repository,
      storeConversations: store,
      repositoryUnreadTotal: 2,
      storeUnreadTotal: 2,
    });
    expect(ok.parity).toBe(true);
    expect(ok.pinnedMatch).toBe(true);

    const bad = compareFloatingConversationParity({
      repositoryConversations: repository,
      storeConversations: [legacyConversation('a', { unreadCount: 2, pinned: false })],
      repositoryUnreadTotal: 2,
      storeUnreadTotal: 2,
    });
    expect(bad.parity).toBe(false);
    expect(bad.pinnedMatch).toBe(false);
  });

  it('records floating conversation metrics when CHAT_CORE_METRICS is on', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    recordFloatingConversationRender({
      source: 'store',
      durationMs: 12,
      storeCount: 2,
      repositoryCount: 2,
    });
    expect(getFloatingConversationMetricsSnapshot()).toMatchObject({
      conversationRenderSource: 'store',
      conversationRenderMs: 12,
      storeConversationCount: 2,
      repositoryConversationCount: 2,
    });
  });

  it('feature flag OFF disables domain store session', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    expect(shouldUseChatDomainStore()).toBe(false);
    expect(getChatDomainStoreSession()).toBeNull();
  });

  it('loadInboxCommand float surface hydrates store from repository list', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    const { loadInboxCommand } = await import('../core/commands');
    const { listChatConversations } = await import('@/repositories/chatConversationsRepository');

    await loadInboxCommand({
      instanceIds: ['inst-1'],
      inboxScope: 'tenant',
      quickFilter: 'all',
      surface: 'float',
    });

    expect(listChatConversations).toHaveBeenCalled();
    expect(selectConversationsForUi(store.getState()).map((c) => c.id)).toEqual([
      'conv-1',
      'conv-2',
    ]);
  });

  it('feature flag ON enables domain store session for floating render path', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    expect(shouldUseChatDomainStore()).toBe(true);
    const session = getChatDomainStoreSession();
    expect(session).not.toBeNull();
    setChatDomainStoreSessionForTests(session);
    applyStoreConversationList([
      legacyConversation('conv-1', { unreadCount: 2 }),
      legacyConversation('conv-2', { unreadCount: 0 }),
    ]);
    expect(selectConversationsForUi(session!.getState()).map((c) => c.id)).toEqual([
      'conv-1',
      'conv-2',
    ]);
  });
});
