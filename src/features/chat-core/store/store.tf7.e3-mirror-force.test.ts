/**
 * TF7 E3 — espelho Store → page cache + forceReload limpa freshness.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadInboxCommand,
  forceReloadInboxCommand,
  invalidateInboxFreshness,
  resetLoadInboxStateForTests,
  markInboxFreshFromClient,
} from '../core/loadInbox';
import {
  mirrorStoreInboxToPageCache,
  mirrorStoreMessagesToPageCache,
  INBOX_PAGE_CACHE_MIRROR_MAX,
} from '../core/inboxPageCacheMirror';
import {
  saveChatPageConversations,
  readChatPageCache,
  readChatPageMessages,
  clearChatPageCacheForSession,
  buildChatPageFiltersKey,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from './index';
import { applyStoreConversationList, applyStoreMessages } from './consolidation';
import type { ChatConversation, ChatMessage } from '@/services/chat';

vi.mock('../core/inboxFetch', () => ({
  fetchInboxConversationsPage: vi.fn(),
  fetchInboxConversations: vi.fn(),
}));

import { fetchInboxConversationsPage } from '../core/inboxFetch';

function legacy(id: string, at: string): ChatConversation {
  return {
    id,
    user_id: 'u1',
    external_chat_id: id,
    unreadCount: 0,
    lastMessageAt: at,
    lastMessagePreview: `preview-${id}`,
  } as ChatConversation;
}

function legacyMsg(id: string, conversationId: string): ChatMessage {
  return {
    id,
    conversation_id: conversationId,
    body: `body-${id}`,
    direction: 'incoming',
    sentAt: '2026-07-16T12:00:00.000Z',
  };
}

describe('TF7 E3 mirror + force reload', () => {
  const scope: ChatPageCacheScope = { tenantId: 't1', userId: 'u1' };
  const filtersKey = buildChatPageFiltersKey({ tenant: 't1', inbox: 'tenant' });
  const params = {
    instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    inboxScope: 'tenant' as const,
    surface: 'chat' as const,
  };

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

  it('mirrorStoreInboxToPageCache grava Store no disk (Store ON)', () => {
    applyStoreConversationList([
      legacy('c1', '2026-07-16T12:00:00.000Z'),
      legacy('c2', '2026-07-16T11:00:00.000Z'),
    ]);
    expect(mirrorStoreInboxToPageCache(scope, filtersKey, 'c1')).toBe(true);
    const cached = readChatPageCache(scope, filtersKey);
    expect(cached?.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(cached?.lastConversationId).toBe('c1');
  });

  it('mirrorStoreMessagesToPageCache grava msgs no disk', () => {
    saveChatPageConversations(scope, filtersKey, [legacy('c1', '2026-07-16T12:00:00.000Z')], 'c1');
    applyStoreMessages('c1', [legacyMsg('m1', 'c1'), legacyMsg('m2', 'c1')]);
    expect(mirrorStoreMessagesToPageCache(scope, 'c1')).toBe(true);
    expect(readChatPageMessages(scope, 'c1')?.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('INBOX_PAGE_CACHE_MIRROR_MAX is 50', () => {
    expect(INBOX_PAGE_CACHE_MIRROR_MAX).toBe(50);
  });

  it('forceReloadInboxCommand bypassa freshness e busca de novo', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await loadInboxCommand(params);
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);

    await forceReloadInboxCommand(params);
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(2);
  });

  it('invalidateInboxFreshness + markFresh: force ainda busca', async () => {
    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('c1', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    applyStoreConversationList([legacy('warmed', '2026-07-16T11:00:00.000Z')]);
    markInboxFreshFromClient(params, Date.now());
    invalidateInboxFreshness();
    await loadInboxCommand(params);
    expect(fetchInboxConversationsPage).toHaveBeenCalledTimes(1);
  });

  it('forceReload com clearPageCacheScope apaga disk', async () => {
    saveChatPageConversations(scope, filtersKey, [legacy('old', '2026-07-16T10:00:00.000Z')], 'old');
    expect(readChatPageCache(scope, filtersKey)).not.toBeNull();

    vi.mocked(fetchInboxConversationsPage).mockResolvedValue({
      items: [legacy('new', '2026-07-16T12:00:00.000Z')],
      nextCursor: null,
      hasMore: false,
      source: 'aggregated',
    });

    await forceReloadInboxCommand(params, { clearPageCacheScope: scope });
    // clear remove o raw; mirror pós-GET fica a cargo da UI — aqui só validamos clear pré-fetch
    // após force o cache foi limpo antes do GET; se ninguém reescreveu, some
    // (forceReload só limpa; não espelha sozinho)
    expect(readChatPageCache(scope, filtersKey)).toBeNull();
  });
});
