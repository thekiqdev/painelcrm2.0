/**
 * TF5 hotfix — WS message dedupe + inbox orderedIds as Store SoT.
 *
 * Bug A: new_message + message.created both applied → duplicate bubbles (temp ids / --:--).
 * Bug B: conversations/set|upsert leave orderedIds stale → list shuffle then normalize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  syncStoreFromSocketEvent,
  selectChatMessagesForUi,
  setChatDomainStoreSessionForTests,
  chatDomainActionCreators,
} from './index';
import { mapDomainEventToActions } from './eventAppliers';
import { mapLegacyMessageToDomain } from './domainMappers';
import { normalizeChatMessage } from '@/services/chat';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation, ChatDomainMessage } from '../domain/types';

function domainConversation(
  id: string,
  lastMessageAt: string | null,
  extras: Partial<ChatDomainConversation> = {},
): ChatDomainConversation {
  return {
    id,
    instanceId: null,
    channel: 'uazapi',
    unreadCount: 0,
    lastMessageAt,
    lastMessagePreview: extras.lastMessagePreview ?? `preview-${id}`,
    contactName: extras.contactName ?? id,
    phoneNumber: null,
    attendanceStatus: null,
    assignedToUserId: null,
    clientId: null,
    leadId: null,
    conversationType: null,
    raw: { id, last_message_at: lastMessageAt },
    ...extras,
  };
}

describe('TF5 WS message dedupe + conversation order', () => {
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

  describe('Bug A — message id normalize + append dedupe', () => {
    it('v2-shaped payload with message_id maps to stable id (not temp-)', () => {
      const normalized = normalizeChatMessage({
        message_id: 'msg-stable-1',
        conversation_id: 'conv-1',
        direction: 'incoming',
        body: 'oi',
        sent_at: new Date('2026-07-15T18:00:00.000Z'),
        provider_message_id: 'wa-ext-1',
      });

      expect(normalized.id).toBe('msg-stable-1');
      expect(normalized.external_message_id).toBe('wa-ext-1');
      expect(normalized.sentAt).toBe('2026-07-15T18:00:00.000Z');

      const domain = mapLegacyMessageToDomain(normalized);
      expect(domain.id).toBe('msg-stable-1');
      expect(domain.id.startsWith('temp-')).toBe(false);
      expect(domain.externalMessageId).toBe('wa-ext-1');
      expect(domain.sentAt).toBe('2026-07-15T18:00:00.000Z');
    });

    it('flat v2 message.created payload maps via eventAppliers without nested .message', () => {
      const actions = mapDomainEventToActions({
        kind: 'message.created',
        protocol: 'v2',
        payload: {
          message_id: 'msg-flat-9',
          conversation_id: 'conv-1',
          direction: 'incoming',
          body: 'oi',
          sent_at: '2026-07-15T18:10:00.000Z',
          provider_message_id: 'prov-9',
        },
        conversationId: 'conv-1',
        instanceId: null,
        receivedAt: Date.now(),
      });

      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe('messages/append');
      if (actions[0]?.type === 'messages/append') {
        expect(actions[0].message.id).toBe('msg-flat-9');
        expect(actions[0].message.externalMessageId).toBe('prov-9');
        expect(actions[0].message.sentAt).toBe('2026-07-15T18:10:00.000Z');
      }
    });

    it('applying new_message-shaped then message.created (same logical msg) does not duplicate', () => {
      const store = session();

      // Simulate legacy/nested new_message (has message.id)
      syncStoreFromSocketEvent({
        kind: 'message.created',
        protocol: 'legacy',
        payload: {
          message: {
            id: 'db-msg-42',
            conversation_id: 'conv-1',
            direction: 'incoming',
            body: 'oi',
            sent_at: '2026-07-15T18:22:00.000Z',
            external_message_id: 'wa-same',
          },
        },
        conversationId: 'conv-1',
        instanceId: null,
        receivedAt: Date.now(),
      });

      // Tenant v2 flat message.created (message_id, not id) — same logical message
      syncStoreFromSocketEvent({
        kind: 'message.created',
        protocol: 'v2',
        payload: {
          message_id: 'db-msg-42',
          conversation_id: 'conv-1',
          direction: 'incoming',
          body: 'oi',
          sent_at: '2026-07-15T18:22:00.000Z',
          provider_message_id: 'wa-same',
        },
        conversationId: 'conv-1',
        instanceId: null,
        receivedAt: Date.now(),
      });

      const ids = selectChatMessagesForUi(store.getState(), 'conv-1').map((m) => m.id);
      expect(ids).toEqual(['db-msg-42']);
    });

    it('duplicate by externalMessageId alone does not append second bubble', () => {
      const store = session();

      const first: ChatDomainMessage = {
        id: 'temp-optimistic-1',
        conversationId: 'conv-1',
        direction: 'incoming',
        body: 'oi',
        status: 'delivered',
        sentAt: '2026-07-15T18:30:00.000Z',
        externalMessageId: 'ext-dedupe-1',
        clientMessageId: null,
      };
      store.dispatch(chatDomainActionCreators.appendMessage('conv-1', first));

      const second: ChatDomainMessage = {
        id: 'canonical-99',
        conversationId: 'conv-1',
        direction: 'incoming',
        body: 'oi',
        status: 'delivered',
        sentAt: '2026-07-15T18:30:00.000Z',
        externalMessageId: 'ext-dedupe-1',
        clientMessageId: null,
      };
      store.dispatch(chatDomainActionCreators.appendMessage('conv-1', second));

      const ui = selectChatMessagesForUi(store.getState(), 'conv-1');
      expect(ui).toHaveLength(1);
      expect(ui[0]?.id).toBe('canonical-99');
      expect(ui[0]?.id.startsWith('temp-')).toBe(false);
      expect(store.getState().messages.byId['temp-optimistic-1']).toBeUndefined();
      expect(store.getState().messages.byId['canonical-99']?.externalMessageId).toBe('ext-dedupe-1');
    });

    it('duplicate by clientMessageId alone merges without second bubble', () => {
      const store = session();
      store.dispatch(
        chatDomainActionCreators.appendMessage('conv-1', {
          id: 'temp-cli-1',
          conversationId: 'conv-1',
          direction: 'outgoing',
          body: 'ping',
          status: 'pending',
          sentAt: null,
          externalMessageId: null,
          clientMessageId: 'client-abc',
        }),
      );
      store.dispatch(
        chatDomainActionCreators.appendMessage('conv-1', {
          id: 'server-abc',
          conversationId: 'conv-1',
          direction: 'outgoing',
          body: 'ping',
          status: 'sent',
          sentAt: '2026-07-15T19:00:00.000Z',
          externalMessageId: 'wa-out-1',
          clientMessageId: 'client-abc',
        }),
      );

      const ui = selectChatMessagesForUi(store.getState(), 'conv-1');
      expect(ui).toHaveLength(1);
      expect(ui[0]?.id).toBe('server-abc');
      expect(ui[0]?.status).toBe('sent');
      expect(store.getState().messages.byId['server-abc']?.externalMessageId).toBe('wa-out-1');
      expect(store.getState().messages.byId['server-abc']?.clientMessageId).toBe('client-abc');
    });
  });

  describe('Bug B — conversations orderedIds SoT', () => {
    it('conversations/set orders orderedIds by lastMessageAt DESC', () => {
      const store = session();
      store.dispatch({
        type: 'conversations/set',
        conversations: [
          domainConversation('older', '2026-07-15T10:00:00.000Z'),
          domainConversation('newer', '2026-07-15T12:00:00.000Z'),
          domainConversation('mid', '2026-07-15T11:00:00.000Z'),
        ],
      });

      expect(store.getState().conversations.orderedIds).toEqual(['newer', 'mid', 'older']);
    });

    it('conversations/upsert with newer lastMessageAt moves id toward front', () => {
      const store = session();
      store.dispatch({
        type: 'conversations/set',
        conversations: [
          domainConversation('a', '2026-07-15T12:00:00.000Z'),
          domainConversation('b', '2026-07-15T11:00:00.000Z'),
          domainConversation('c', '2026-07-15T10:00:00.000Z'),
        ],
      });
      expect(store.getState().conversations.orderedIds[0]).toBe('a');

      store.dispatch({
        type: 'conversations/upsert',
        conversation: domainConversation('c', '2026-07-15T13:00:00.000Z', {
          lastMessagePreview: 'fresh',
        }),
      });

      expect(store.getState().conversations.orderedIds).toEqual(['c', 'a', 'b']);
      expect(store.getState().conversations.byId.c?.lastMessagePreview).toBe('fresh');
    });
  });
});
