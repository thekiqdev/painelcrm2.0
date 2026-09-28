import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureChatInstances,
  getChatInstanceRegistrySnapshot,
  resetChatInstanceRegistry,
} from './instance-registry';
import {
  applyChatUnreadIncomingMessage,
  fetchChatAttendanceCounts,
  getChatGlobalUnreadCount,
  reconcileChatAttendanceCounts,
  resetChatUnreadEngine,
} from './unread-engine';
import { resetChatReconcileDiagnostics } from './reconcile';
import { resetChatBaselineMetrics, getChatF3PerformanceStatistics } from './metrics/baseline';
import { isChatF3FlagEnabled, shouldUseChatInstanceRegistry } from './feature-flags';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';

vi.mock('@/services/chat', () => ({
  chatService: {
    listInstances: vi.fn(async () => [
      {
        id: 'inst-1',
        user_id: 'u1',
        name: 'WA',
        status: 'connected',
        metadata: { enabled_in_chat: true },
      },
    ]),
    getConversationAttendanceCounts: vi.fn(async () => ({
      queue: 1,
      mine: 2,
      team: 0,
      unassigned: 0,
      closed: 0,
      wa_archived: 0,
      unread: 3,
    })),
  },
}));

describe('chat-core F3 instance registry + unread engine', () => {
  beforeEach(() => {
    resetChatBaselineMetrics();
    resetChatInstanceRegistry();
    resetChatUnreadEngine();
    resetChatReconcileDiagnostics();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({
      CHAT_INSTANCE_REGISTRY: true,
      CHAT_UNREAD_ENGINE: true,
      CHAT_ATTENDANCE_RECONCILE: true,
    });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
  });

  it('keeps F3 flags off by default when unset', () => {
    resetChatMigrationFlagsToDefaults();
    expect(shouldUseChatInstanceRegistry()).toBe(false);
    expect(isChatF3FlagEnabled('CHAT_UNREAD_ENGINE')).toBe(false);
    expect(isChatF3FlagEnabled('CHAT_ATTENDANCE_RECONCILE')).toBe(false);
  });

  it('deduplicates listInstances via registry cache', async () => {
    const { chatService } = await import('@/services/chat');
    await ensureChatInstances({ reason: 'bootstrap' });
    await ensureChatInstances({ reason: 'bootstrap' });
    expect(chatService.listInstances).toHaveBeenCalledTimes(1);
    expect(getChatInstanceRegistrySnapshot().instances).toHaveLength(1);
  });

  it('increments global unread incrementally without HTTP on message', () => {
    applyChatUnreadIncomingMessage('conv-1', false);
    expect(getChatGlobalUnreadCount()).toBe(1);
    applyChatUnreadIncomingMessage('conv-1', true);
    expect(getChatGlobalUnreadCount()).toBe(1);
  });

  it('reconciles attendance counts via HTTP on bootstrap', async () => {
    const { chatService } = await import('@/services/chat');
    const c = await fetchChatAttendanceCounts(
      { instanceIds: ['inst-1'], inboxScope: 'tenant' },
      { reason: 'bootstrap', force: true },
    );
    expect(c.unread).toBe(3);
    expect(chatService.getConversationAttendanceCounts).toHaveBeenCalledTimes(1);
    await reconcileChatAttendanceCounts('manual');
    expect(chatService.getConversationAttendanceCounts).toHaveBeenCalledTimes(2);
  });

  it('falls back to legacy listInstances when registry flag off', async () => {
    setChatMigrationFlagsForTests({ CHAT_INSTANCE_REGISTRY: false });
    resetChatInstanceRegistry();
    const { chatService } = await import('@/services/chat');
    vi.mocked(chatService.listInstances).mockClear();
    await ensureChatInstances({ reason: 'bootstrap' });
    expect(chatService.listInstances).toHaveBeenCalledTimes(1);
    expect(getChatInstanceRegistrySnapshot().instances).toHaveLength(0);
  });

  it('records F3 performance statistics for avoided HTTP and reconciles', async () => {
    const { chatService } = await import('@/services/chat');
    vi.mocked(chatService.listInstances).mockClear();
    vi.mocked(chatService.getConversationAttendanceCounts).mockClear();
    await ensureChatInstances({ reason: 'bootstrap' });
    await ensureChatInstances({ reason: 'bootstrap' });

    await fetchChatAttendanceCounts(
      { instanceIds: ['inst-1'], inboxScope: 'tenant' },
      { reason: 'bootstrap', force: true },
    );
    await fetchChatAttendanceCounts(
      { instanceIds: ['inst-1'], inboxScope: 'tenant' },
      { reason: 'bootstrap' },
    );

    applyChatUnreadIncomingMessage('conv-2', false);

    const stats = getChatF3PerformanceStatistics();
    expect(chatService.listInstances).toHaveBeenCalledTimes(1);
    expect(stats.listInstances.httpExecuted).toBe(1);
    expect(stats.listInstances.httpAvoided).toBeGreaterThanOrEqual(1);
    expect(stats.listInstances.reductionPercent).toBeGreaterThan(0);
    expect(stats.attendanceCounts.httpExecuted).toBe(1);
    expect(stats.attendanceCounts.httpAvoided).toBeGreaterThanOrEqual(2);
    expect(stats.overallReductionPercent).toBeGreaterThan(0);
    expect(stats.reconcilesExecuted).toBeGreaterThanOrEqual(2);
    expect(stats.reconcilesAvoided).toBeGreaterThanOrEqual(1);
    expect(stats.reconcileReductionPercent).toBeGreaterThan(0);
  });
});
