import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  listChatConversations,
  listBubbleChatConversations,
} from './chatConversationsRepository';
import { resetChatConversationsMetrics, getChatConversationsMetricsSnapshot } from '@/lib/chatConversationsMetrics';

vi.mock('@/lib/chatAggregatedFlags', () => ({
  isChatAggregatedSurfaceEnabled: vi.fn(() => false),
}));

vi.mock('@/lib/chatConversationsFetch', () => ({
  fetchMergedChatConversations: vi.fn(async () => [
    { id: 'c1', user_id: 'u1', external_chat_id: '1', unreadCount: 0 },
  ]),
}));

vi.mock('@/services/chat', () => ({
  chatService: {
    getConversationsAggregated: vi.fn(async () => ({
      items: [{ id: 'agg-1', user_id: 'u1', external_chat_id: '2', unreadCount: 1 }],
      meta: {
        apiVersion: 2,
        limit: 200,
        returned: 1,
        hasMore: false,
        nextCursor: null,
        sort: 'last_message_at',
        view: 'list',
        instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        generatedAt: new Date().toISOString(),
      },
    })),
    getConversations: vi.fn(async () => []),
  },
  normalizeConversation: (raw: unknown) => raw,
}));

import { isChatAggregatedSurfaceEnabled } from '@/lib/chatAggregatedFlags';
import { fetchMergedChatConversations } from '@/lib/chatConversationsFetch';
import { chatService } from '@/services/chat';

describe('chatConversationsRepository F4b', () => {
  const instanceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    resetChatConversationsMetrics();
    vi.mocked(isChatAggregatedSurfaceEnabled).mockReturnValue(false);
    vi.mocked(fetchMergedChatConversations).mockClear();
    vi.mocked(chatService.getConversationsAggregated).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses legacy fetch when surface flag is off', async () => {
    const result = await listChatConversations({
      surface: 'float',
      instanceIds: [instanceId],
      inboxScope: 'tenant',
      quickFilter: 'all',
    });
    expect(result.source).toBe('legacy');
    expect(fetchMergedChatConversations).toHaveBeenCalledTimes(1);
    expect(chatService.getConversationsAggregated).not.toHaveBeenCalled();
    const stats = getChatConversationsMetricsSnapshot();
    expect(stats.legacyCalls).toBe(1);
    expect(stats.aggregatedCalls).toBe(0);
  });

  it('uses aggregated API when surface flag is on', async () => {
    vi.mocked(isChatAggregatedSurfaceEnabled).mockReturnValue(true);
    const result = await listChatConversations({
      surface: 'float',
      instanceIds: [instanceId],
      inboxScope: 'tenant',
      quickFilter: 'unread',
    });
    expect(result.source).toBe('aggregated');
    expect(chatService.getConversationsAggregated).toHaveBeenCalledTimes(1);
    expect(fetchMergedChatConversations).not.toHaveBeenCalled();
    const stats = getChatConversationsMetricsSnapshot();
    expect(stats.aggregatedCalls).toBe(1);
  });

  it('falls back to legacy when aggregated throws', async () => {
    vi.mocked(isChatAggregatedSurfaceEnabled).mockReturnValue(true);
    vi.mocked(chatService.getConversationsAggregated).mockRejectedValueOnce(new Error('api down'));
    const result = await listChatConversations({
      surface: 'chat',
      instanceIds: [instanceId],
      inboxScope: 'owner',
    });
    expect(result.source).toBe('legacy');
    expect(fetchMergedChatConversations).toHaveBeenCalledTimes(1);
    const stats = getChatConversationsMetricsSnapshot();
    expect(stats.fallbacks).toBe(1);
  });

  it('bubble uses limit 4 path when aggregated', async () => {
    vi.mocked(isChatAggregatedSurfaceEnabled).mockReturnValue(true);
    const items = await listBubbleChatConversations({
      surface: 'float',
      instanceIds: [instanceId],
      inboxScope: 'tenant',
    });
    expect(items).toHaveLength(1);
    expect(chatService.getConversationsAggregated).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 4,
        channelOrigin: 'uazapi',
      }),
    );
    const call = vi.mocked(chatService.getConversationsAggregated).mock.calls[0]?.[0];
    expect(call).not.toHaveProperty('includeWhatsAppOfficial');
  });
});
