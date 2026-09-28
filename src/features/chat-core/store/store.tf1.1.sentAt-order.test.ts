/**
 * Hotfix TF1.1 — mapLegacyMessageToDomain must prefer normalizeChatMessage.sentAt
 * (production path — sem mock que devolve o raw intacto).
 */

import { describe, it, expect } from 'vitest';
import { mapLegacyMessageToDomain } from './domainMappers';
import { sortDomainMessages } from './messageSelectors';
import { sortMessagesChronological } from './messageMerge';

describe('TF1.1 domain message sentAt from normalize camelCase', () => {
  it('maps API sent_at into domain.sentAt (not null via created_at-only)', () => {
    const domain = mapLegacyMessageToDomain({
      id: 'm1',
      conversation_id: 'c1',
      direction: 'incoming',
      body: 'hello',
      status: 'delivered',
      sent_at: '2026-07-15T13:31:00.000Z',
      created_at: '2026-07-15T10:00:00.000Z',
    } as never);

    expect(domain.sentAt).toBe('2026-07-15T13:31:00.000Z');
  });

  it('sorts by WhatsApp sent_at even when created_at is reverse/insert order', () => {
    // API raw (snake) → real normalize → domain (production path)
    const apiRows = [
      {
        id: 'newer',
        conversation_id: 'c1',
        direction: 'incoming' as const,
        body: '13:31',
        sent_at: '2026-07-15T13:31:00.000Z',
        created_at: '2026-07-15T12:00:00.000Z',
      },
      {
        id: 'older',
        conversation_id: 'c1',
        direction: 'outgoing' as const,
        body: '13:28',
        sent_at: '2026-07-15T13:28:00.000Z',
        created_at: '2026-07-15T12:01:00.000Z',
      },
    ];

    const domain = sortMessagesChronological(apiRows.map((r) => mapLegacyMessageToDomain(r as never)));
    expect(domain.map((m) => m.id)).toEqual(['older', 'newer']);
    expect(domain.map((m) => m.sentAt)).toEqual([
      '2026-07-15T13:28:00.000Z',
      '2026-07-15T13:31:00.000Z',
    ]);

    // select path also ASC
    const selected = sortDomainMessages([...domain].reverse());
    expect(selected.map((m) => m.id)).toEqual(['older', 'newer']);
  });

  it('prefers sentAt when only camelCase is present after normalize', () => {
    const domain = mapLegacyMessageToDomain({
      id: 'm2',
      conversation_id: 'c1',
      direction: 'incoming',
      body: 'x',
      sentAt: '2026-07-15T14:00:00.000Z',
      created_at: '2026-07-15T09:00:00.000Z',
    } as never);

    expect(domain.sentAt).toBe('2026-07-15T14:00:00.000Z');
  });
});
