/**
 * Hotfix TF3.1 — lean conversation.updated must not create ghost inbox rows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
  syncStoreFromSocketEvent,
  selectChatConversationsForUi,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation } from '../domain/types';

const richConversation = (id: string): ChatDomainConversation => ({
  id,
  instanceId: 'inst-1',
  channel: 'uazapi',
  unreadCount: 0,
  lastMessageAt: '2026-07-15T12:00:00.000Z',
  lastMessagePreview: 'old',
  contactName: 'Mercado Livre',
  phoneNumber: '+5511978506319',
  attendanceStatus: 'in_progress',
  assignedToUserId: null,
  clientId: 'client-1',
  leadId: null,
  conversationType: 'group',
  raw: {
    id,
    user_id: 'user-1',
    external_chat_id: 'x@g.us',
    client_id: 'client-1',
    phone_number: '+5511978506319',
    contact_name: 'Mercado Livre',
  },
});

describe('TF3.1 lean conversation.updated no ghost row', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  function session() {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    return store;
  }

  it('lean tenant payload patches existing row without duplicating', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([richConversation('conv-1')]));

    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        provider: 'uazapi',
        conversation_id: 'conv-1',
        last_message_preview: '*Kaique Silva Santos* oi',
        last_message_at: '2026-07-15T14:00:00.000Z',
        unread_count: 1,
        status: null,
        assigned_user_id: null,
        assigned_team_id: null,
        display_name: 'Mercado Livre',
        avatar_url: null,
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });

    const rows = selectChatConversationsForUi(store.getState());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('conv-1');
    expect(rows[0]?.lastMessagePreview).toBe('*Kaique Silva Santos* oi');
    expect(rows[0]?.client_id).toBe('client-1');
    expect(store.getState().conversations.byId['conv-1']?.phoneNumber).toBe('+5511978506319');
    expect(store.getState().conversations.byId['conv-1']?.clientId).toBe('client-1');
    expect(store.getState().conversations.orderedIds).toEqual(['conv-1']);
  });

  it('lean payload for unknown conversation does not insert ghost', () => {
    const store = session();
    store.dispatch(chatDomainActionCreators.setConversations([richConversation('conv-1')]));

    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        conversation_id: 'conv-ghost',
        last_message_preview: 'ghost',
        last_message_at: '2026-07-15T14:00:00.000Z',
        unread_count: 0,
        display_name: 'Fantasma',
      },
      conversationId: 'conv-ghost',
      instanceId: null,
      receivedAt: Date.now(),
    });

    const rows = selectChatConversationsForUi(store.getState());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('conv-1');
    expect(store.getState().conversations.byId['conv-ghost']).toBeUndefined();
  });

  it('full conversation.updated with id still upserts / inserts', () => {
    const store = session();
    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'v2',
      payload: {
        id: 'conv-new',
        user_id: 'user-1',
        external_chat_id: 'y@g.us',
        last_message_preview: 'hello',
        last_message_at: '2026-07-09T12:00:00.000Z',
        unread_count: 2,
        contact_name: 'Novo',
      },
      conversationId: 'conv-new',
      instanceId: null,
      receivedAt: Date.now(),
    });
    const rows = selectChatConversationsForUi(store.getState());
    expect(rows.some((c) => c.id === 'conv-new')).toBe(true);
    expect(rows.find((c) => c.id === 'conv-new')?.lastMessagePreview).toBe('hello');
  });
});
