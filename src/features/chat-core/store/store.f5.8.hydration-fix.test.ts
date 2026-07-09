/**
 * F5.8 — hidratação do inbox no Domain Store na abertura do /chat.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  ensureChatDomainStoreSession,
  getChatDomainStoreSession,
  resetChatDomainStoreSession,
} from './session';
import { applyStoreConversationList } from './consolidation';
import { selectChatConversationsForUi } from './chatSelectors';
import type { ChatConversation } from '@/services/chat';

function legacyConversation(id: string): ChatConversation {
  return {
    id,
    user_id: 'u1',
    external_chat_id: `${id}@s.whatsapp.net`,
    instance_id: 'inst-1',
    contactName: `Contact ${id}`,
    lastMessagePreview: `preview-${id}`,
    lastMessageAt: '2026-07-09T12:00:00.000Z',
    unreadCount: 0,
  };
}

describe('F5.8 chat inbox store hydration', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetChatDomainStoreSession();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
  });

  it('ensureChatDomainStoreSession creates store before applyStoreConversationList', () => {
    const store = ensureChatDomainStoreSession();
    expect(store).not.toBeNull();
    expect(getChatDomainStoreSession()).toBe(store);

    const rows = [legacyConversation('c-1'), legacyConversation('c-2')];
    applyStoreConversationList(rows);

    const state = store!.getState();
    expect(state.conversations.orderedIds).toHaveLength(2);
    expect(selectChatConversationsForUi(state)).toHaveLength(2);
    expect(selectChatConversationsForUi(state)[0]?.id).toBe('c-1');
  });

  it('simulates instances-ready → eager load path (no one-render delay)', () => {
    ensureChatDomainStoreSession();
    const fifty = Array.from({ length: 50 }, (_, i) => legacyConversation(`conv-${i}`));
    applyStoreConversationList(fifty);

    const state = getChatDomainStoreSession()!.getState();
    expect(selectChatConversationsForUi(state)).toHaveLength(50);
    expect(state.conversations.orderedIds[0]).toBe('conv-0');
  });

  it('preserves lastMessagePreview after mapLegacyConversationToDomain (double normalize)', () => {
    ensureChatDomainStoreSession();
    applyStoreConversationList([legacyConversation('c-preview')]);

    const rows = selectChatConversationsForUi(getChatDomainStoreSession()!.getState());
    expect(rows[0]?.lastMessagePreview).toBe('preview-c-preview');
  });
});
