/**
 * TF3.3 — view=list deve devolver avatar de exibição quando só há CDN WhatsApp / meta
 * (F5 hidratava lista sem foto; WS full ainda trazia metadata).
 */
import { describe, expect, it } from 'vitest';
import { mapConversationRowsForClient } from './rowMapper.js';

const CDN = 'https://pps.whatsapp.net/v/t61.24694-24/group.jpg';

describe('TF3.3 list avatar display (CDN / meta)', () => {
  it('view=list keeps WhatsApp CDN in avatar_url when no catalog cache', () => {
    const [item] = mapConversationRowsForClient(
      [
        {
          id: 'c1',
          user_id: 'u1',
          external_chat_id: '120363@g.us',
          conversation_type: 'group',
          display_name: 'Grupo Teste',
          contact_name: 'Grupo Teste',
          avatar_url: CDN,
          metadata: {},
          last_message_preview: 'oi',
          last_message_at: '2026-07-15T12:00:00.000Z',
          unread_count: 0,
        },
      ],
      'list',
    );

    expect(item.avatar_url).toBe(CDN);
    expect(item.final_avatar_url).toBeNull();
  });

  it('view=list resolves avatar from metadata.image when column empty', () => {
    const [item] = mapConversationRowsForClient(
      [
        {
          id: 'c2',
          user_id: 'u1',
          external_chat_id: '5511999999999@s.whatsapp.net',
          display_name: 'Contato',
          avatar_url: null,
          metadata: { image: CDN },
          last_message_preview: 'oi',
          last_message_at: '2026-07-15T12:00:00.000Z',
          unread_count: 0,
        },
      ],
      'list',
    );

    expect(item.avatar_url).toBe(CDN);
  });

  it('view=list prefers catalog cache over CDN for final_avatar_url', () => {
    const catalog = '/api/public/catalog-media/raw?key=avatars%2Fx.jpg&sig=1';
    const [item] = mapConversationRowsForClient(
      [
        {
          id: 'c3',
          user_id: 'u1',
          external_chat_id: '5511888888888@s.whatsapp.net',
          display_name: 'Contato',
          avatar_url: CDN,
          avatar_cached_url: catalog,
          metadata: { image: CDN },
          last_message_preview: 'oi',
          last_message_at: '2026-07-15T12:00:00.000Z',
          unread_count: 0,
        },
      ],
      'list',
    );

    expect(item.final_avatar_url).toBe(catalog);
    expect(item.avatar_url).toBe(catalog);
  });
});
