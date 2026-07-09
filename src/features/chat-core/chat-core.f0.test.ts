import { describe, expect, it } from 'vitest';
import {
  normalizeMessageCreatedEvent,
  normalizeConversationUpdatedEvent,
  normalizeSocketEventByName,
  getChatPhaseFlagsSnapshot,
  CHAT_PHASE_TO_FLAG,
  getChatBaselineSnapshot,
  resetChatBaselineMetrics,
  chatRealtimeBridge,
  chatCore,
} from './index';

describe('chat-core F0 foundation', () => {
  it('normalizes v2 message.created without throwing', () => {
    const event = normalizeMessageCreatedEvent(
      {
        conversation_id: 'conv-1',
        message: { id: 'msg-1', body: 'oi', direction: 'incoming' },
      },
      'v2',
    );
    expect(event.kind).toBe('message.created');
    expect(event.protocol).toBe('v2');
    expect(event.conversationId).toBe('conv-1');
    expect(event.messageId).toBe('msg-1');
  });

  it('normalizes legacy conversation_updated via router', () => {
    const event = normalizeSocketEventByName('conversation_updated', {
      id: 'conv-2',
      last_message_preview: 'x',
    });
    expect(event.kind).toBe('conversation.updated');
    expect(event.protocol).toBe('legacy');
    expect(event.conversationId).toBe('conv-2');
  });

  it('normalizeConversationUpdatedEvent picks conversation id', () => {
    const event = normalizeConversationUpdatedEvent({ conversationId: 'c3' }, 'v2');
    expect(event.conversationId).toBe('c3');
  });

  it('keeps all phase flags off by default', () => {
    const snap = getChatPhaseFlagsSnapshot();
    for (const flag of Object.values(CHAT_PHASE_TO_FLAG)) {
      expect(snap[flag]).toBe(false);
    }
  });

  it('exposes unwired core and bridge without side effects on UI stores', () => {
    expect(chatCore.phase).toBe('F5.7');
    expect(chatCore.isWired).toBe(false);
    expect(chatCore.getMessages('x')).toEqual([]);
    // Flag OFF → Bridge reporta not_wired (F1 path inativo)
    expect(chatRealtimeBridge.status).toBe('not_wired');
    expect(chatRealtimeBridge.connect('tok')).toBeNull();
  });


  it('baseline snapshot is available', () => {
    resetChatBaselineMetrics();
    const snap = getChatBaselineSnapshot();
    expect(snap.phaseFlags.CHAT_SINGLE_SOCKET).toBe(false);
    expect(typeof snap.collectedAt).toBe('string');
  });
});
