/**
 * TF8 E4 — bubble prefer Store / skip HTTP limit=4.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from './index';
import { applyStoreConversationList } from './consolidation';
import type { ChatConversation } from '@/services/chat';
import {
  peekBubbleRecentFromDomainStore,
  resolveBubbleRecentConversations,
} from '../core/resolveBubbleRecent';
import { resetLoadInboxStateForTests } from '../core/loadInbox';

vi.mock('@/repositories/chatConversationsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/repositories/chatConversationsRepository')>();
  return {
    ...actual,
    listBubbleChatConversations: vi.fn(async () => [
      { id: 'bubble-http', unreadCount: 0 } as ChatConversation,
    ]),
  };
});

import { listBubbleChatConversations } from '@/repositories/chatConversationsRepository';

function legacy(id: string, at: string): ChatConversation {
  return {
    id,
    user_id: 'u1',
    external_chat_id: `${id}@s.whatsapp.net`,
    instance_id: 'i1',
    contactName: id,
    lastMessagePreview: null,
    lastMessageAt: at,
    unreadCount: 0,
  };
}

describe('TF8 E4 bubble prefer Store', () => {
  beforeEach(() => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    resetLoadInboxStateForTests();
    vi.mocked(listBubbleChatConversations).mockClear();
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('peekBubbleRecentFromDomainStore slices Store when non-empty', () => {
    applyStoreConversationList([
      legacy('c1', '2026-07-16T12:00:00.000Z'),
      legacy('c2', '2026-07-16T11:00:00.000Z'),
    ]);
    const peeked = peekBubbleRecentFromDomainStore(4);
    expect(peeked?.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('resolveBubbleRecentConversations uses Store and skips HTTP', async () => {
    applyStoreConversationList([legacy('s1', '2026-07-16T12:00:00.000Z')]);
    const rows = await resolveBubbleRecentConversations({
      instanceIds: ['i1'],
      inboxScope: 'tenant',
    });
    expect(rows.map((c) => c.id)).toEqual(['s1']);
    expect(listBubbleChatConversations).not.toHaveBeenCalled();
  });

  it('resolveBubbleRecentConversations falls back to bubble HTTP when Store empty', async () => {
    const rows = await resolveBubbleRecentConversations({
      instanceIds: ['i1'],
      inboxScope: 'tenant',
    });
    expect(rows[0]?.id).toBe('bubble-http');
    expect(listBubbleChatConversations).toHaveBeenCalledTimes(1);
  });
});
