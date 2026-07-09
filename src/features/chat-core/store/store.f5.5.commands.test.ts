import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { applyStoreConversationList } from './consolidation';
import {
  createChatDomainStore,
  syncStoreFromCommandResult,
  getCommandMetricsSnapshot,
  resetCommandMetrics,
  setChatDomainStoreSessionForTests,
  selectMessages,
} from './index';
import { compareCommandParity } from './commandShadowValidation';
import { resetCommandQueueForTests, getPendingCommandCount } from './commandQueue';
import {
  sendMessageCommand,
  markConversationReadCommand,
  assignConversationCommand,
  closeConversationCommand,
  archiveConversationCommand,
  pinConversationCommand,
  chatCoreCommands,
} from '../core/commands';
import { executeChatCommand } from '../core/commandDispatcher';
import {
  applyOptimisticSendMessage,
  applyOptimisticMarkConversationRead,
} from './optimistic';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from './domainMappers';
import { getChatDomainStoreSession } from './session';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatConversation, ChatMessage } from '@/services/chat';
import { chatDomainActionCreators } from './actions';

const sendMessageMock = vi.fn();
const markConversationReadMock = vi.fn();
const patchAttendanceMock = vi.fn();

vi.mock('@/services/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat')>();
  return {
    ...actual,
    chatService: {
      ...actual.chatService,
      sendMessage: (...args: unknown[]) => sendMessageMock(...args),
      markConversationRead: (...args: unknown[]) => markConversationReadMock(...args),
      patchConversationAttendance: (...args: unknown[]) => patchAttendanceMock(...args),
      transferConversation: vi.fn(async () => ({ ok: true, conversation: {} })),
      attendConversation: vi.fn(async () => ({ ok: true })),
      systemDeleteConversation: vi.fn(async () => ({
        ok: true,
        conversation_id: 'c1',
        deleted_messages_count: 0,
      })),
    },
  };
});

const legacyConversation = (id: string, extra: Partial<ChatConversation> = {}): ChatConversation =>
  ({
    id,
    user_id: 'u1',
    external_chat_id: `55${id}`,
    unread_count: 2,
    unreadCount: 2,
    attendance_status: 'in_progress',
    assigned_to_user_id: 'user-a',
    lastMessageAt: '2026-07-08T10:00:00.000Z',
    ...extra,
  }) as ChatConversation;

function session() {
  const store = getChatDomainStoreSession();
  if (!store) throw new Error('store missing');
  return store;
}

describe('chat-core F5.5 commands migration', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetCommandMetrics();
    resetCommandQueueForTests();
    setChatDomainStoreSessionForTests(null);
    sendMessageMock.mockReset();
    markConversationReadMock.mockReset();
    patchAttendanceMock.mockReset();

    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    applyStoreConversationList([legacyConversation('c1')]);
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
    resetCommandMetrics();
    resetCommandQueueForTests();
  });

  it('send success applies optimistic then confirms with server message', async () => {
    sendMessageMock.mockResolvedValue({
      message: {
        id: 'msg-server',
        conversation_id: 'c1',
        body: 'hello',
        direction: 'outgoing',
        status: 'sent',
        sent_at: '2026-07-08T10:01:00.000Z',
      },
    });

    const result = await sendMessageCommand('c1', 'hello', {
      clientMessageId: 'client-1',
      optimisticId: 'optimistic-client-1',
    });

    expect(result.id).toBe('msg-server');
    expect(session().getState().commands.pendingCommands).toEqual({});
    expect(sendMessageMock).toHaveBeenCalledWith('c1', 'hello', {
      clientMessageId: 'client-1',
    });
    const messages = session().getState().messages.byConversationId['c1'] ?? [];
    expect(
      messages.some((id) => session().getState().messages.byId[id]?.id === 'msg-server'),
    ).toBe(true);
  });

  it('send rollback removes optimistic message on HTTP error', async () => {
    sendMessageMock.mockRejectedValue(new Error('network'));
    const beforeIds = [...(session().getState().messages.byConversationId['c1'] ?? [])];

    await expect(
      sendMessageCommand('c1', 'fail', {
        clientMessageId: 'client-fail',
        optimisticId: 'optimistic-client-fail',
      }),
    ).rejects.toThrow('network');

    const afterIds = session().getState().messages.byConversationId['c1'] ?? [];
    expect(afterIds).toEqual(beforeIds);
    expect(session().getState().commands.rollbackStack).toHaveLength(0);
    expect(getCommandMetricsSnapshot().commandRollbackCount).toBeGreaterThanOrEqual(1);
  });

  it('optimistic message is appended with sending status', () => {
    const optimistic = {
      id: 'opt-1',
      conversationId: 'c1',
      direction: 'outgoing' as const,
      body: 'draft',
      status: 'sending',
      sentAt: new Date().toISOString(),
      externalMessageId: null,
      clientMessageId: 'c1-client',
    };
    const token = applyOptimisticSendMessage('c1', optimistic);
    const messages = selectMessages(session().getState(), 'c1');
    expect(messages.some((m) => m.id === 'opt-1' && m.status === 'sending')).toBe(true);
    expect(session().getState().commands.optimisticChanges[token]).toBeDefined();
  });

  it('confirm clears pending commands and rollback stack entry', async () => {
    markConversationReadMock.mockResolvedValue(undefined);
    await markConversationReadCommand('c1');
    expect(Object.keys(session().getState().commands.pendingCommands)).toHaveLength(0);
    expect(session().getState().commands.rollbackStack).toHaveLength(0);
    expect(session().getState().conversations.byId['c1']?.unreadCount).toBe(0);
  });

  it('rollback restores unread on markConversationRead failure', async () => {
    markConversationReadMock.mockRejectedValue(new Error('read-fail'));
    const beforeUnread = session().getState().conversations.byId['c1']?.unreadCount ?? 0;

    await expect(markConversationReadCommand('c1')).rejects.toThrow('read-fail');
    expect(session().getState().conversations.byId['c1']?.unreadCount).toBe(beforeUnread);
  });

  it('assign optimistic updates assigned user', async () => {
    patchAttendanceMock.mockResolvedValue({
      ok: true,
      conversation: legacyConversation('c1', { assigned_to_user_id: 'user-b' }),
    });
    await assignConversationCommand('c1', { assignedToUserId: 'user-b' });
    expect(session().getState().conversations.byId['c1']?.assignedToUserId).toBe('user-b');
  });

  it('close optimistic sets status closed', async () => {
    patchAttendanceMock.mockResolvedValue({
      ok: true,
      conversation: legacyConversation('c1', { attendance_status: 'closed' }),
    });
    await closeConversationCommand('c1');
    expect(session().getState().conversations.byId['c1']?.attendanceStatus).toBe('closed');
  });

  it('archive optimistic sets status archived', async () => {
    patchAttendanceMock.mockResolvedValue({
      ok: true,
      conversation: legacyConversation('c1', { attendance_status: 'archived' }),
    });
    await archiveConversationCommand('c1');
    expect(session().getState().conversations.byId['c1']?.attendanceStatus).toBe('archived');
  });

  it('pin optimistic sets pinned in raw', async () => {
    await pinConversationCommand('c1');
    const raw = session().getState().conversations.byId['c1']?.raw as Record<string, unknown>;
    expect(raw?.pinned).toBe(true);
  });

  it('markConversationRead optimistic zeros unread immediately', () => {
    applyOptimisticMarkConversationRead('c1');
    expect(session().getState().conversations.byId['c1']?.unreadCount).toBe(0);
    expect(session().getState().unread.byConversationId['c1']).toBe(0);
  });

  it('retries command when configured', async () => {
    let calls = 0;
    sendMessageMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary');
      return {
        message: {
          id: 'msg-retry',
          conversation_id: 'c1',
          body: 'ok',
          direction: 'outgoing',
          status: 'sent',
        },
      };
    });

    await executeChatCommand({
      command: 'sendMessage',
      conversationId: 'c1',
      retries: 1,
      applyOptimistic: () =>
        applyOptimisticSendMessage('c1', {
          id: 'opt-retry',
          conversationId: 'c1',
          direction: 'outgoing',
          body: 'ok',
          status: 'sending',
          sentAt: new Date().toISOString(),
          externalMessageId: null,
          clientMessageId: null,
        }),
      execute: async () => {
        const { chatService } = await import('@/services/chat');
        const { message } = await chatService.sendMessage('c1', 'ok');
        if (!message) throw new Error('empty');
        return mapLegacyMessageToDomain(message);
      },
      mapConfirmPayload: (r) => r,
    });

    expect(calls).toBe(2);
    expect(getCommandMetricsSnapshot().commandRetries).toBeGreaterThanOrEqual(1);
  });

  it('tracks multiple commands in queue', async () => {
    markConversationReadMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5)),
    );
    const p1 = markConversationReadCommand('c1');
    const p2 = pinConversationCommand('c1');
    expect(getPendingCommandCount('c1')).toBeGreaterThanOrEqual(1);
    await Promise.all([p1, p2]);
    expect(getPendingCommandCount('c1')).toBe(0);
  });

  it('maintains rollback stack during pending optimistic command', () => {
    applyOptimisticMarkConversationRead('c1');
    expect(session().getState().commands.rollbackStack.length).toBeGreaterThanOrEqual(1);
    const token = session().getState().commands.rollbackStack[0]!.id;
    session().dispatch({ type: 'commands/rollback', token });
    expect(session().getState().conversations.byId['c1']?.unreadCount).toBe(2);
  });

  it('dispatcher bypasses pipeline when CHAT_CORE_STORE is off', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    let optimisticCalled = false;
    const result = await executeChatCommand({
      command: 'sendMessage',
      applyOptimistic: () => {
        optimisticCalled = true;
        return 'token';
      },
      execute: async () => 'ok',
    });
    expect(result).toBe('ok');
    expect(optimisticCalled).toBe(false);
  });

  it('records command metrics when CHAT_CORE_METRICS is on', async () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    markConversationReadMock.mockResolvedValue(undefined);
    resetCommandMetrics();
    await markConversationReadCommand('c1');
    const metrics = getCommandMetricsSnapshot();
    expect(metrics.commandOptimisticCount).toBeGreaterThanOrEqual(1);
    expect(metrics.confirmLatency).toBeGreaterThanOrEqual(0);
  });

  it('compareCommandParity validates store vs legacy snapshot', () => {
    applyOptimisticMarkConversationRead('c1');
    const domain = mapLegacyConversationToDomain(legacyConversation('c1'));
    const parity = compareCommandParity({
      storeState: session().getState(),
      conversationId: 'c1',
      legacyConversation: domain,
    });
    expect(parity.idMatch).toBe(true);
    expect(parity.unreadMatch).toBe(false);
    expect(parity.optimisticMatch).toBe(false);
  });

  it('send with pre-applied optimistic replaces optimistic on confirm', async () => {
    const optimisticId = 'optimistic-client-1';
    const optimistic = {
      id: optimisticId,
      conversation_id: 'c1',
      direction: 'outgoing' as const,
      body: 'hello',
      status: 'queued',
      created_at: new Date().toISOString(),
      client_message_id: 'client-1',
    };
    session().dispatch(
      chatDomainActionCreators.setMessages('c1', [mapLegacyMessageToDomain(optimistic as ChatMessage)]),
    );

    sendMessageMock.mockResolvedValue({
      message: {
        id: 'msg-server',
        conversation_id: 'c1',
        body: 'hello',
        direction: 'outgoing',
        status: 'sent',
        sent_at: '2026-07-08T10:01:00.000Z',
      },
    });

    await sendMessageCommand('c1', 'hello', {
      clientMessageId: 'client-1',
      optimisticId,
    });

    const ids = session().getState().messages.byConversationId['c1'] ?? [];
    expect(ids).toEqual(['msg-server']);
    expect(ids.some((id) => id.startsWith('optimistic-'))).toBe(false);
  });

  it('sortDomainMessages ignores messages without id', async () => {
    const { sortDomainMessages } = await import('./messageSelectors');
    const sorted = sortDomainMessages([
      { id: 'b', conversationId: 'c1', direction: 'outgoing', body: 'b', status: 'sent', sentAt: null, externalMessageId: null, clientMessageId: null },
      { id: undefined as unknown as string, conversationId: 'c1', direction: 'outgoing', body: 'x', status: 'sent', sentAt: null, externalMessageId: null, clientMessageId: null },
      { id: 'a', conversationId: 'c1', direction: 'outgoing', body: 'a', status: 'sent', sentAt: '2026-07-08T10:00:00.000Z', externalMessageId: null, clientMessageId: null },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('chatCore.commands namespace exposes all handlers', () => {
    expect(typeof chatCoreCommands.sendMessage).toBe('function');
    expect(typeof chatCoreCommands.markConversationRead).toBe('function');
    expect(typeof chatCoreCommands.assignConversation).toBe('function');
    expect(typeof chatCoreCommands.transferConversation).toBe('function');
    expect(typeof chatCoreCommands.closeConversation).toBe('function');
    expect(typeof chatCoreCommands.archiveConversation).toBe('function');
    expect(typeof chatCoreCommands.deleteConversation).toBe('function');
    expect(typeof chatCoreCommands.pinConversation).toBe('function');
    expect(typeof chatCoreCommands.unpinConversation).toBe('function');
    expect(typeof chatCoreCommands.updateConversationStatus).toBe('function');
  });
});
