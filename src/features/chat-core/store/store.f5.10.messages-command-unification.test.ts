/**
 * F5.10 — Command Unification (único pipeline loadMessages).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMessagesCommand,
  resetLoadMessagesStateForTests,
} from '../core/loadMessages';
import { mapRepositoryResponseToActions } from './repositorySync';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  getChatDomainStoreSession,
  syncStoreFromCommandResult,
  selectChatMessagesForUi,
  selectMessagesForUi,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { mapLegacyMessageToDomain } from './domainMappers';
import type { ChatMessage } from '@/services/chat';
import type { ChatDomainMessage } from '../domain/types';

const legacyMessage = (id: string, conversationId: string): ChatMessage =>
  ({
    id,
    conversation_id: conversationId,
    direction: 'incoming',
    body: `body-${id}`,
    status: 'delivered',
    sent_at: '2026-07-09T12:00:00.000Z',
  }) as ChatMessage;

const domainMessages = (ids: string[], conversationId: string): ChatDomainMessage[] =>
  ids.map((id) => mapLegacyMessageToDomain(legacyMessage(id, conversationId)));

vi.mock('../core/messagesFetch', () => ({
  fetchConversationMessages: vi.fn(async (conversationId: string) =>
    domainMessages(['msg-1', 'msg-2'], conversationId),
  ),
}));

vi.mock('../core/messagesPageFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/messagesPageFetch')>();
  return {
    ...actual,
    getMessagesPage: vi.fn(async (params: { conversationId: string }) => ({
      messages: domainMessages(['msg-1', 'msg-2'], params.conversationId),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      source: 'legacy' as const,
    })),
  };
});

describe('F5.10 messages command unification', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetLoadMessagesStateForTests();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetLoadMessagesStateForTests();
    setChatDomainStoreSessionForTests(null);
    vi.clearAllMocks();
  });

  it('repositorySync accepts legacy payload', () => {
    const actions = mapRepositoryResponseToActions('listMessages', [
      legacyMessage('a', 'conv-1'),
      legacyMessage('b', 'conv-1'),
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('messages/set');
    expect((actions[0] as { conversationId: string }).conversationId).toBe('conv-1');
    expect((actions[0] as { messages: ChatDomainMessage[] }).messages).toHaveLength(2);
  });

  it('repositorySync accepts domain payload', () => {
    const rows = domainMessages(['a', 'b'], 'conv-1');
    const actions = mapRepositoryResponseToActions('listMessages', rows);
    expect(actions).toHaveLength(1);
    expect((actions[0] as { messages: ChatDomainMessage[] }).messages.map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('syncStoreFromCommandResult hydrates store with domain payload', () => {
    const store = getChatDomainStoreSession()!;
    syncStoreFromCommandResult('listMessages', domainMessages(['m1', 'm2'], 'conv-x'));
    expect(selectChatMessagesForUi(store.getState(), 'conv-x').map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('loadMessagesCommand hydrates store (Chat path)', async () => {
    await loadMessagesCommand('conv-1');
    const state = getChatDomainStoreSession()!.getState();
    expect(selectChatMessagesForUi(state, 'conv-1').map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('Floating and Chat share same ordered message ids', async () => {
    await loadMessagesCommand('conv-parity');
    const afterFirst = selectMessagesForUi(getChatDomainStoreSession()!.getState(), 'conv-parity').map(
      (m) => m.id,
    );

    const { getMessagesPage } = await import('../core/messagesPageFetch');
    vi.mocked(getMessagesPage).mockResolvedValueOnce({
      messages: domainMessages(['msg-1', 'msg-2'], 'conv-parity'),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      source: 'legacy',
    });
    await loadMessagesCommand('conv-parity');
    const afterSecond = selectMessagesForUi(getChatDomainStoreSession()!.getState(), 'conv-parity').map(
      (m) => m.id,
    );

    expect(afterFirst).toEqual(['msg-1', 'msg-2']);
    expect(afterSecond).toEqual(afterFirst);
  });

  it('concurrency — last generation wins per conversation', async () => {
    const { getMessagesPage } = await import('../core/messagesPageFetch');
    let resolveFirst: (v: Awaited<ReturnType<typeof getMessagesPage>>) => void;
    const firstPromise = new Promise<Awaited<ReturnType<typeof getMessagesPage>>>((r) => {
      resolveFirst = r;
    });
    vi.mocked(getMessagesPage)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => ({
        messages: domainMessages(['only-last'], 'conv-1'),
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        source: 'legacy' as const,
      }));

    const p1 = loadMessagesCommand('conv-1');
    const p2 = loadMessagesCommand('conv-1');

    await p2;
    expect(selectChatMessagesForUi(getChatDomainStoreSession()!.getState(), 'conv-1').map((m) => m.id)).toEqual(
      ['only-last'],
    );

    resolveFirst!({
      messages: domainMessages(['stale'], 'conv-1'),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      source: 'legacy',
    });
    await p1;
    expect(selectChatMessagesForUi(getChatDomainStoreSession()!.getState(), 'conv-1').map((m) => m.id)).toEqual(
      ['only-last'],
    );
  });

  it('CHAT_CORE_STORE OFF does not write store', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    await loadMessagesCommand('conv-1');
    expect(getChatDomainStoreSession()?.getState().messages.byConversationId['conv-1']).toBeUndefined();
  });
});
