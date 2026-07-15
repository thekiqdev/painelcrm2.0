/**
 * Sprint 3 / Phase 10G — loadMessages coalescing + generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMessagesCommand,
  resetLoadMessagesStateForTests,
  getLoadMessagesGenerationForTests,
} from './loadMessages';
import {
  getOpenConversationPipelineMetricsSnapshot,
  resetOpenConversationPipelineMetricsForTests,
} from '../metrics/openConversationPipelineMetrics';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import { setChatDomainStoreSessionForTests, createChatDomainStore } from '../store/index';

vi.mock('./messagesPageFetch', () => ({
  DEFAULT_MESSAGES_PAGE_SIZE: 30,
  getMessagesPage: vi.fn(async ({ conversationId }: { conversationId: string }) => {
    await new Promise((r) => setTimeout(r, 30));
    return {
      messages: [
        {
          id: `m-${conversationId}`,
          conversationId,
          direction: 'incoming' as const,
          body: 'hello',
          status: 'delivered',
          sentAt: '2026-07-15T12:00:00.000Z',
          externalMessageId: null,
          clientMessageId: null,
        },
      ],
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
    };
  }),
}));

describe('Sprint 3 loadMessagesCommand coalescing', () => {
  beforeEach(() => {
    resetLoadMessagesStateForTests();
    resetOpenConversationPipelineMetricsForTests();
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    setChatDomainStoreSessionForTests(createChatDomainStore());
  });

  afterEach(() => {
    resetLoadMessagesStateForTests();
    resetOpenConversationPipelineMetricsForTests();
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('coalesces parallel opens of the same conversation', async () => {
    const a = loadMessagesCommand('c1');
    const b = loadMessagesCommand('c1');
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    const snap = getOpenConversationPipelineMetricsSnapshot();
    expect(snap.open_start_total).toBe(1);
    expect(snap.open_coalesced_total).toBe(1);
    expect(getLoadMessagesGenerationForTests('c1')).toBe(1);
  });

  it('force starts a new generation', async () => {
    await loadMessagesCommand('c1');
    await loadMessagesCommand('c1', { force: true });
    expect(getLoadMessagesGenerationForTests('c1')).toBe(2);
    expect(getOpenConversationPipelineMetricsSnapshot().open_start_total).toBe(2);
  });
});
