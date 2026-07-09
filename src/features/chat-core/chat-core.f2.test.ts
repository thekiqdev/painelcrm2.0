import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatMessage } from '@/services/chat';
import {
  isMessageCreatedPayloadSufficient,
  isConversationUpdatedPayloadSufficient,
  isConversationDeletedPayloadSufficient,
  isAttendanceUpdatedPayloadSufficient,
  tryApplyChatWsPatch,
  getChatWsPatchFlagsSnapshot,
  getChatWsPatchStatistics,
  resetChatBaselineMetrics,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';

function seedConversationList(
  queryClient: QueryClient,
  conversations: ChatConversation[],
): void {
  queryClient.setQueryData(
    ['floating-chat', 'conversations', 'inst-1', 'tenant', 'all'],
    conversations,
  );
}

function seedMessages(
  queryClient: QueryClient,
  conversationId: string,
  messages: ChatMessage[],
): void {
  queryClient.setQueryData(['floating-chat', 'messages', conversationId], messages);
}

describe('chat-core F2 ws-patch', () => {
  beforeEach(() => {
    resetChatBaselineMetrics();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({
      CHAT_WS_PATCH_MESSAGE: true,
      CHAT_WS_PATCH_CONVERSATION: true,
      CHAT_WS_PATCH_MESSAGE_UPDATED: true,
      CHAT_WS_PATCH_DELETE: true,
      CHAT_WS_PATCH_ATTENDANCE: true,
    });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  it('keeps all ws-patch sub-flags off by default when unset', () => {
    resetChatMigrationFlagsToDefaults();
    const snap = getChatWsPatchFlagsSnapshot();
    expect(snap.CHAT_WS_PATCH_MESSAGE).toBe(false);
    expect(snap.CHAT_WS_PATCH_CONVERSATION).toBe(false);
    expect(snap.CHAT_WS_PATCH_DELETE).toBe(false);
  });

  it('validates message.created v2 payload sufficiency', () => {
    expect(
      isMessageCreatedPayloadSufficient({
        conversation_id: 'c1',
        message_id: 'm1',
        direction: 'incoming',
        body: 'oi',
      }),
    ).toBe(true);
    expect(isMessageCreatedPayloadSufficient({ conversation_id: 'c1' })).toBe(false);
  });

  it('validates conversation.updated payload sufficiency', () => {
    expect(
      isConversationUpdatedPayloadSufficient({
        conversation_id: 'c1',
        last_message_preview: 'hi',
      }),
    ).toBe(true);
    expect(isConversationUpdatedPayloadSufficient({ id: 'c1' })).toBe(false);
  });

  it('patches message.created into cached messages without invalidate', () => {
    const qc = new QueryClient();
    const conv: ChatConversation = {
      id: 'c1',
      user_id: 'u1',
      external_chat_id: '5511999999999',
      unreadCount: 0,
      lastMessagePreview: 'old',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
    };
    seedConversationList(qc, [conv]);
    seedMessages(qc, 'c1', []);

    const result = tryApplyChatWsPatch(
      qc,
      'message.created',
      {
        conversation_id: 'c1',
        message_id: 'm-new',
        direction: 'incoming',
        body: 'nova',
        sent_at: '2026-07-08T12:00:00.000Z',
      },
      { isActiveConversation: true },
    );

    expect(result.applied).toBe(true);
    const messages = qc.getQueryData<ChatMessage[]>(['floating-chat', 'messages', 'c1']);
    expect(messages?.length).toBe(1);
    expect(messages?.[0]?.body).toBe('nova');
  });

  it('falls back when message.created flag is off', () => {
    setChatMigrationFlagsForTests({ CHAT_WS_PATCH_MESSAGE: false });
    const qc = new QueryClient();
    seedMessages(qc, 'c1', []);
    const result = tryApplyChatWsPatch(qc, 'message.created', {
      conversation_id: 'c1',
      message_id: 'm1',
      direction: 'incoming',
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('flag_off');
  });

  it('patches conversation.updated ordering in list cache', () => {
    const qc = new QueryClient();
    seedConversationList(qc, [
      {
        id: 'c1',
        user_id: 'u1',
        external_chat_id: '1',
        unreadCount: 1,
        lastMessageAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        user_id: 'u1',
        external_chat_id: '2',
        unreadCount: 0,
        lastMessageAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const result = tryApplyChatWsPatch(qc, 'conversation.updated', {
      conversation_id: 'c1',
      last_message_preview: 'updated',
      last_message_at: '2026-07-08T15:00:00.000Z',
      unread_count: 2,
    });

    expect(result.applied).toBe(true);
    const list = qc.getQueryData<ChatConversation[]>([
      'floating-chat',
      'conversations',
      'inst-1',
      'tenant',
      'all',
    ]);
    expect(list?.[0]?.id).toBe('c1');
    expect(list?.[0]?.lastMessagePreview).toBe('updated');
  });

  it('removes conversation on conversation.deleted patch', () => {
    const qc = new QueryClient();
    seedConversationList(qc, [
      {
        id: 'c-del',
        user_id: 'u1',
        external_chat_id: 'x',
        unreadCount: 0,
      },
    ]);

    expect(isConversationDeletedPayloadSufficient({ conversation_id: 'c-del' })).toBe(true);
    const result = tryApplyChatWsPatch(qc, 'conversation.deleted', { conversation_id: 'c-del' });
    expect(result.applied).toBe(true);
    const list = qc.getQueryData<ChatConversation[]>([
      'floating-chat',
      'conversations',
      'inst-1',
      'tenant',
      'all',
    ]);
    expect(list?.some((c) => c.id === 'c-del')).toBe(false);
  });

  it('documents attendance patch requires conversation in cache', () => {
    const qc = new QueryClient();
    const payload = {
      conversation: {
        id: 'c-att',
        attendance_status: 'in_progress',
        assigned_to_user_id: 'u2',
      },
    };
    expect(isAttendanceUpdatedPayloadSufficient(payload)).toBe(true);
    const result = tryApplyChatWsPatch(qc, 'conversation_attendance_updated', payload);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('conversation_not_in_cache');
  });

  it('records patch statistics with applied, fallback and success rate', () => {
    const qc = new QueryClient();
    seedConversationList(qc, [
      {
        id: 'c1',
        user_id: 'u1',
        external_chat_id: '1',
        unreadCount: 0,
      },
    ]);
    seedMessages(qc, 'c1', []);

    tryApplyChatWsPatch(qc, 'message.created', {
      conversation_id: 'c1',
      message_id: 'm1',
      direction: 'incoming',
      body: 'ok',
    });

    setChatMigrationFlagsForTests({
      CHAT_WS_PATCH_MESSAGE: false,
      CHAT_WS_PATCH_CONVERSATION: true,
      CHAT_WS_PATCH_MESSAGE_UPDATED: true,
      CHAT_WS_PATCH_DELETE: true,
      CHAT_WS_PATCH_ATTENDANCE: true,
    });
    tryApplyChatWsPatch(qc, 'message.created', {
      conversation_id: 'c1',
      message_id: 'm2',
      direction: 'incoming',
    });

    setChatMigrationFlagsForTests({
      CHAT_WS_PATCH_MESSAGE: true,
      CHAT_WS_PATCH_CONVERSATION: true,
      CHAT_WS_PATCH_MESSAGE_UPDATED: true,
      CHAT_WS_PATCH_DELETE: true,
      CHAT_WS_PATCH_ATTENDANCE: true,
    });
    tryApplyChatWsPatch(qc, 'message.created', { conversation_id: 'c-missing' });

    const stats = getChatWsPatchStatistics();
    expect(stats.totalApplied).toBe(1);
    expect(stats.totalFallback).toBe(2);
    expect(stats.overallSuccessRate).toBe(33.33);

    const messageStat = stats.byEventKind.find((r) => r.eventKind === 'message.created');
    expect(messageStat?.applied).toBe(1);
    expect(messageStat?.fallback).toBe(2);
    expect(messageStat?.successRate).toBe(33.33);
    expect(messageStat?.fallbackReasons.flag_off).toBe(1);
    expect(messageStat?.fallbackReasons.payload_insufficient).toBe(1);
  });
});
