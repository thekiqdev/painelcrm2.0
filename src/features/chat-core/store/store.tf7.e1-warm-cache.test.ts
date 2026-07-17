/**
 * TF7 E1 — warm Domain Store a partir do chatPageCache (sem rede).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  saveChatPageConversations,
  saveChatPageMessages,
  buildChatPageFiltersKey,
  clearChatPageCacheForSession,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { warmInboxFromPageCache } from '../core/warmInboxFromPageCache';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
} from './index';
import { getChatDomainStoreSession } from './session';
import { selectConversationIds } from './conversationSelectors';
import { selectMessagesForUi } from './messageSelectors';
import { applyStoreConversationList } from './consolidation';
import type { ChatConversation, ChatMessage } from '@/services/chat';

function legacyConv(id: string, at: string): ChatConversation {
  return {
    id,
    user_id: 'u1',
    external_chat_id: `${id}@s.whatsapp.net`,
    instance_id: 'inst-1',
    contactName: `Contact ${id}`,
    lastMessagePreview: `preview-${id}`,
    lastMessageAt: at,
    unreadCount: 0,
  };
}

function legacyMsg(id: string, conversationId: string): ChatMessage {
  return {
    id,
    conversation_id: conversationId,
    body: `body-${id}`,
    direction: 'incoming',
    sentAt: '2026-07-16T12:00:00.000Z',
  };
}

describe('TF7 E1 warmInboxFromPageCache', () => {
  const scope: ChatPageCacheScope = { tenantId: 't1', userId: 'u1' };
  const filtersKey = buildChatPageFiltersKey({
    tenant: 't1',
    inbox: 'tenant',
    attendance: '',
    channel: 'all',
    listFilter: 'all',
    instances: 'inst-1',
  });

  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
    clearChatPageCacheForSession(scope);
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
  });

  afterEach(() => {
    clearChatPageCacheForSession(scope);
    setChatDomainStoreSessionForTests(null);
    resetChatMigrationFlagsToDefaults();
  });

  it('Store ON + cache presente → Store recebe rows sem rede', () => {
    const rows = [
      legacyConv('c1', '2026-07-16T12:00:00.000Z'),
      legacyConv('c2', '2026-07-16T11:00:00.000Z'),
    ];
    saveChatPageConversations(scope, filtersKey, rows, 'c1');
    saveChatPageMessages(scope, 'c1', [legacyMsg('m1', 'c1'), legacyMsg('m2', 'c1')]);

    const result = warmInboxFromPageCache({ scope, filtersKey });

    expect(result.warmed).toBe(true);
    expect(result.reason).toBe('applied');
    expect(result.conversationCount).toBe(2);
    expect(result.lastConversationId).toBe('c1');
    expect(result.messagesWarmed).toBe(true);

    const state = getChatDomainStoreSession()!.getState();
    expect(selectConversationIds(state)).toEqual(['c1', 'c2']);
    expect(selectMessagesForUi(state, 'c1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('filtersKey diferente → não aplica warm cruzado', () => {
    saveChatPageConversations(
      scope,
      filtersKey,
      [legacyConv('c1', '2026-07-16T12:00:00.000Z')],
      'c1',
    );

    const otherKey = buildChatPageFiltersKey({
      tenant: 't1',
      inbox: 'tenant',
      attendance: 'mine',
      channel: 'all',
      listFilter: 'all',
      instances: 'inst-1',
    });
    const result = warmInboxFromPageCache({ scope, filtersKey: otherKey });

    expect(result.warmed).toBe(false);
    expect(result.reason).toBe('no_cache');
    expect(selectConversationIds(getChatDomainStoreSession()!.getState())).toEqual([]);
  });

  it('Store já hidratada → onlyIfEmpty não sobrescreve', () => {
    applyStoreConversationList([legacyConv('existing', '2026-07-16T10:00:00.000Z')]);
    saveChatPageConversations(
      scope,
      filtersKey,
      [legacyConv('cached', '2026-07-16T12:00:00.000Z')],
      'cached',
    );

    const result = warmInboxFromPageCache({ scope, filtersKey });

    expect(result.warmed).toBe(false);
    expect(result.reason).toBe('store_not_empty');
    expect(selectConversationIds(getChatDomainStoreSession()!.getState())).toEqual(['existing']);
  });

  it('Store OFF → no-op', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: false });
    saveChatPageConversations(
      scope,
      filtersKey,
      [legacyConv('c1', '2026-07-16T12:00:00.000Z')],
      'c1',
    );

    const result = warmInboxFromPageCache({ scope, filtersKey });
    expect(result.warmed).toBe(false);
    expect(result.reason).toBe('store_off');
  });
});
