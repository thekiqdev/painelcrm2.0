/**
 * Sprint 2 / Phase 10E — Floating conversation meta from Domain Store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  setChatDomainStoreSessionForTests,
  chatDomainActionCreators,
  selectCurrentConversation,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';

describe('Sprint 2 floating conversation meta (Store)', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('selectCurrentConversation returns UI row for header', () => {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          id: 'c1',
          instanceId: 'i1',
          channel: 'uazapi',
          unreadCount: 2,
          lastMessageAt: '2026-07-15T12:00:00.000Z',
          lastMessagePreview: 'hi',
          contactName: 'Alice',
          phoneNumber: null,
          attendanceStatus: 'in_progress',
          assignedToUserId: null,
          clientId: 'client-1',
          leadId: null,
          conversationType: 'direct',
        },
      ]),
    );
    const row = selectCurrentConversation(store.getState(), 'c1');
    expect(row?.id).toBe('c1');
    expect(row?.client_id).toBe('client-1');
    expect(row?.lastMessagePreview).toBe('hi');
    expect(row?.unreadCount).toBe(2);
  });
});
