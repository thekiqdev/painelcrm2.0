import { describe, expect, it } from 'vitest';
import { normalizeConversation } from './chat';
import { mapLegacyConversationToDomain } from '@/features/chat-core/store/domainMappers';
import { domainConversationToUi } from '@/features/chat-core/store/domainToUi';

describe('normalizeConversation CRM idempotency (Phase 10A hotfix)', () => {
  it('preserves leadId when re-normalizing an already-normalized conversation', () => {
    const fromApi = normalizeConversation({
      id: 'c1',
      user_id: 'u1',
      external_chat_id: '5511999999999',
      lead_id: 'lead-1',
      client_id: null,
      last_message_at: '2026-07-14T12:00:00.000Z',
      unread_count: 0,
    });
    expect(fromApi.leadId).toBe('lead-1');

    const again = normalizeConversation(fromApi);
    expect(again.leadId).toBe('lead-1');
  });

  it('mapLegacyConversationToDomain keeps leadId after linkConversation-shaped input', () => {
    const linked = normalizeConversation({
      id: 'c1',
      user_id: 'u1',
      external_chat_id: '5511999999999',
      lead_id: 'lead-9',
    });
    const domain = mapLegacyConversationToDomain(linked);
    expect(domain.leadId).toBe('lead-9');
    expect(domainConversationToUi(domain).leadId).toBe('lead-9');
  });
});
