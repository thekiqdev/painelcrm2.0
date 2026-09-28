import { describe, expect, it } from 'vitest';
import {
  shouldUseSingleChatSocket,
  chatRealtimeBridge,
} from '@/features/chat-core';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';

describe('chat-core F1 single socket', () => {
  it('defaults CHAT_SINGLE_SOCKET to off (rollback path)', () => {
    expect(shouldUseSingleChatSocket()).toBe(false);
  });

  it('bridge stays not_wired when flag off', () => {
    expect(chatRealtimeBridge.status).toBe('not_wired');
    expect(chatRealtimeBridge.connect('any-token')).toBeNull();
  });

  it('preserves realtime window event contract names', () => {
    expect(REALTIME_WINDOW_EVENTS.messageCreated).toBe('painelcrm:realtime:message.created');
    expect(REALTIME_WINDOW_EVENTS.conversationUpdated).toBe(
      'painelcrm:realtime:conversation.updated',
    );
    expect(REALTIME_WINDOW_EVENTS.conversationDeleted).toBe(
      'painelcrm:realtime:conversation.deleted',
    );
  });
});
