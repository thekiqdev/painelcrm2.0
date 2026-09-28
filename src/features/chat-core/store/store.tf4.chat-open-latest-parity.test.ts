/**
 * TF4 — open sync→hydrate e última bolha ≡ preview da lista.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMessagesCommand,
  openConversationMessagesCommand,
  resetLoadMessagesStateForTests,
} from '../core/loadMessages';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  getChatDomainStoreSession,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyMessageToDomain, mapLegacyConversationToDomain } from './domainMappers';
import { derivePreviewTextFromDomainMessage, pickLastDomainMessage } from './previewFromMessages';
import type { ChatMessage, ChatConversation } from '@/services/chat';
import type { ChatDomainMessage } from '../domain/types';
import { chatDomainActionCreators } from './actions';

const legacyMessage = (
  id: string,
  conversationId: string,
  body: string,
  sentAt: string,
): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body,
    status: 'delivered',
    sent_at: sentAt,
  }) as ChatMessage;

const domainMessages = (
  rows: Array<{ id: string; body: string; sentAt: string }>,
  conversationId: string,
): ChatDomainMessage[] =>
  rows.map((r) =>
    mapLegacyMessageToDomain(legacyMessage(r.id, conversationId, r.body, r.sentAt)),
  );

const syncConversationMessages = vi.fn(async () => ({ synced: 1 }));

vi.mock('@/services/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat')>();
  return {
    ...actual,
    chatService: {
      ...actual.chatService,
      syncConversationMessages: (...args: unknown[]) => syncConversationMessages(...args),
    },
  };
});

vi.mock('../core/messagesPageFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/messagesPageFetch')>();
  return {
    ...actual,
    getMessagesPage: vi.fn(async (params: { conversationId: string }) => ({
      messages: domainMessages(
        [
          { id: 'm1', body: 'antiga', sentAt: '2026-07-15T10:00:00.000Z' },
          { id: 'm2', body: 'to contando os dias', sentAt: '2026-07-15T12:00:00.000Z' },
        ],
        params.conversationId,
      ),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      source: 'legacy' as const,
    })),
  };
});

describe('TF4 chat open latest parity', () => {
  beforeEach(() => {
    resetLoadMessagesStateForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
    syncConversationMessages.mockClear();
    syncConversationMessages.mockResolvedValue({ synced: 1 });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('openConversationMessagesCommand awaits sync before force hydrate', async () => {
    const order: string[] = [];
    syncConversationMessages.mockImplementation(async () => {
      order.push('sync');
      return { synced: 1 };
    });
    const { getMessagesPage } = await import('../core/messagesPageFetch');
    vi.mocked(getMessagesPage).mockImplementation(async (params) => {
      order.push('hydrate');
      return {
        messages: domainMessages(
          [{ id: 'm2', body: 'to contando os dias', sentAt: '2026-07-15T12:00:00.000Z' }],
          params.conversationId,
        ),
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        source: 'legacy' as const,
      };
    });

    await openConversationMessagesCommand('c1');

    expect(order).toEqual(['sync', 'hydrate']);
    expect(syncConversationMessages).toHaveBeenCalledWith('c1', {});
  });

  it('após open, última msg do Store ≡ lastMessagePreview (10D)', async () => {
    const store = getChatDomainStoreSession()!;
    const conv = mapLegacyConversationToDomain({
      id: 'c1',
      external_chat_id: '5511@s.whatsapp.net',
      lastMessagePreview: 'preview stale da inbox',
      last_message_preview: 'preview stale da inbox',
      lastMessageAt: '2026-07-15T11:00:00.000Z',
    } as ChatConversation);
    store.dispatch(chatDomainActionCreators.upsertConversation(conv));

    await openConversationMessagesCommand('c1');

    const state = store.getState();
    const last = pickLastDomainMessage(state, 'c1');
    expect(last).toBeTruthy();
    const fromLast = derivePreviewTextFromDomainMessage(last!);
    expect(fromLast).toBe('to contando os dias');
    expect(state.conversations.byId['c1']?.lastMessagePreview).toBe(fromLast);
  });

  it('openConversationMessagesCommand força nova hydrate (sync + force)', async () => {
    await loadMessagesCommand('c1');
    syncConversationMessages.mockClear();
    await openConversationMessagesCommand('c1');
    expect(syncConversationMessages).toHaveBeenCalledWith('c1', {});
  });
});
