/**
 * Hotfix TF3.2 — full conversation.updated must not wipe hydrated avatar caches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
  syncStoreFromSocketEvent,
} from './index';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation } from '../domain/types';
import { mergeDomainConversationFullUpsert } from './conversationUpsertMerge';

const rich = (id: string): ChatDomainConversation => ({
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
    avatar_url: 'https://cdn.example/group.jpg',
    avatar_cached_url: 'https://cdn.example/cached-group.jpg',
    client_whatsapp_avatar_cached_url: 'https://cdn.example/client-wa.jpg',
    metadata: { whatsapp_profile_photo: 'https://cdn.example/meta.jpg' },
  },
});

describe('TF3.2 preserve avatar on full upsert', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true });
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    setChatDomainStoreSessionForTests(null);
  });

  it('merge keeps caches when incoming avatar fields are empty', () => {
    const existing = rich('conv-1');
    const incoming: ChatDomainConversation = {
      ...existing,
      lastMessagePreview: 'oi',
      lastMessageAt: '2026-07-15T14:52:00.000Z',
      raw: {
        id: 'conv-1',
        user_id: 'user-1',
        external_chat_id: 'x@g.us',
        last_message_preview: 'oi',
        avatar_url: null,
        avatar_cached_url: null,
        metadata: {},
      },
    };
    const merged = mergeDomainConversationFullUpsert(existing, incoming);
    expect(merged.lastMessagePreview).toBe('oi');
    const raw = merged.raw as Record<string, unknown>;
    expect(raw.avatar_cached_url).toBe('https://cdn.example/cached-group.jpg');
    expect(raw.avatar_url).toBe('https://cdn.example/group.jpg');
    expect(raw.client_whatsapp_avatar_cached_url).toBe('https://cdn.example/client-wa.jpg');
    expect((raw.metadata as Record<string, unknown>).whatsapp_profile_photo).toBe(
      'https://cdn.example/meta.jpg',
    );
  });

  it('merge replaces avatar when incoming brings a new non-empty URL', () => {
    const existing = rich('conv-1');
    const incoming: ChatDomainConversation = {
      ...existing,
      raw: {
        ...(existing.raw as object),
        avatar_cached_url: 'https://cdn.example/new-cached.jpg',
      },
    };
    const merged = mergeDomainConversationFullUpsert(existing, incoming);
    expect((merged.raw as Record<string, unknown>).avatar_cached_url).toBe(
      'https://cdn.example/new-cached.jpg',
    );
  });

  it('full WS conversation.updated preserves hydrated avatar caches in store', () => {
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);
    store.dispatch(chatDomainActionCreators.setConversations([rich('conv-1')]));

    syncStoreFromSocketEvent({
      kind: 'conversation.updated',
      protocol: 'legacy',
      payload: {
        id: 'conv-1',
        user_id: 'user-1',
        external_chat_id: 'x@g.us',
        last_message_preview: '*Kaique* oi',
        last_message_at: '2026-07-15T14:52:00.000Z',
        unread_count: 0,
        avatar_url: null,
        contact_name: 'Mercado Livre',
      },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });

    const row = store.getState().conversations.byId['conv-1'];
    const raw = row?.raw as Record<string, unknown>;
    expect(row?.lastMessagePreview).toBe('*Kaique* oi');
    expect(raw.avatar_cached_url).toBe('https://cdn.example/cached-group.jpg');
    expect(raw.client_whatsapp_avatar_cached_url).toBe('https://cdn.example/client-wa.jpg');
  });

  it('attendance_updated partial patch does not wipe contact name in raw', () => {
    const existing = rich('conv-1');
    existing.raw = {
      ...(existing.raw as object),
      contactName: 'Criar Loja',
      displayName: 'Criar Loja',
      phoneNumber: '+5511999999999',
    };
    const incoming: ChatDomainConversation = {
      ...existing,
      attendanceStatus: 'in_progress',
      assignedToUserId: 'agent-1',
      contactName: null,
      phoneNumber: null,
      raw: {
        id: 'conv-1',
        attendance_status: 'in_progress',
        assigned_to_user_id: 'agent-1',
        assignee_display: 'Kaique',
        assignee_avatar_url: 'https://cdn.example/kaique.jpg',
        last_assignment_reason: 'attend',
        contactName: null,
        displayName: null,
        phoneNumber: null,
      },
    };
    const merged = mergeDomainConversationFullUpsert(existing, incoming);
    const raw = merged.raw as Record<string, unknown>;
    expect(merged.contactName).toBe('Mercado Livre');
    expect(raw.contactName).toBe('Criar Loja');
    expect(raw.displayName).toBe('Criar Loja');
    expect(raw.phoneNumber).toBe('+5511999999999');
    expect(raw.assignee_display).toBe('Kaique');
    expect(merged.assignedToUserId).toBe('agent-1');
  });
});
