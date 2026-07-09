import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearChatMigrationFlagsCacheForTests,
  isChatAggregatedConversationsEnabled,
  isChatMigrationFlagEnabled,
  setChatMigrationFlagsCacheForTests,
} from './service.js';

describe('chatMigrationFlags service', () => {
  beforeEach(() => {
    clearChatMigrationFlagsCacheForTests();
  });

  it('defaults all flags to false', () => {
    expect(isChatMigrationFlagEnabled('CHAT_SINGLE_SOCKET')).toBe(false);
    expect(isChatAggregatedConversationsEnabled()).toBe(false);
  });

  it('enables aggregated API when any F4 surface flag is on', () => {
    setChatMigrationFlagsCacheForTests({ CHAT_AGGREGATED_FLOAT: true });
    expect(isChatAggregatedConversationsEnabled()).toBe(true);
    clearChatMigrationFlagsCacheForTests();
    setChatMigrationFlagsCacheForTests({ CHAT_AGGREGATED_CHAT: true });
    expect(isChatAggregatedConversationsEnabled()).toBe(true);
  });

  it('reads individual flags from cache', () => {
    setChatMigrationFlagsCacheForTests({
      CHAT_WS_PATCH_MESSAGE: true,
      CHAT_AGGREGATED_API_SHADOW: true,
    });
    expect(isChatMigrationFlagEnabled('CHAT_WS_PATCH_MESSAGE')).toBe(true);
    expect(isChatMigrationFlagEnabled('CHAT_AGGREGATED_API_SHADOW')).toBe(true);
    expect(isChatMigrationFlagEnabled('CHAT_WS_PATCH_DELETE')).toBe(false);
  });
});
