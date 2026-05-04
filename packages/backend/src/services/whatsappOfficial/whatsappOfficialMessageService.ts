import { pool } from '../../utils/db.js';
import { normalizeBrazilWhatsappPhone } from '../../utils/phone/normalizeBrazilPhone.js';
import { sendTextMessage as graphSendText } from './whatsappOfficialClient.js';
import { getAccountCredentials } from './whatsappOfficialConfigService.js';

function externalChatIdFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return `${d}@s.whatsapp.net`;
}

/**
 * Envia texto Cloud API e grava mensagem outbound no chat (provider whatsapp_official).
 */
export async function sendOfficialTextAndPersist(params: {
  accountId: string;
  inboxUserId: string;
  toPhoneDigits: string;
  text: string;
}): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const cred = await getAccountCredentials(params.accountId);
  if (!cred) return { ok: false, error: 'Conta não encontrada' };

  const normalized = normalizeBrazilWhatsappPhone(params.toPhoneDigits);
  if (!normalized.ok || !normalized.phone) {
    return {
      ok: false,
      error:
        normalized.reason === 'empty'
          ? 'Informe um telefone válido.'
          : 'Telefone inválido. Use número brasileiro com DDD (ex.: 11999999999).',
    };
  }

  const send = await graphSendText(cred.phoneNumberId, cred.accessToken, normalized.phone, params.text);
  if (!send.ok) {
    return { ok: false, error: send.error };
  }
  const wamid = send.messages?.[0]?.id;

  const extId = externalChatIdFromDigits(normalized.phone);
  const phoneDigits = normalized.phone.replace(/\D/g, '');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let conv = await client.query<{ id: string }>(
      `SELECT id::text FROM chat_conversations
       WHERE whatsapp_official_account_id = $1::uuid AND external_chat_id = $2 LIMIT 1`,
      [params.accountId, extId]
    );

    let conversationId: string;
    if (conv.rows.length === 0) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO chat_conversations (
           user_id, instance_id, external_chat_id, phone_number,
           whatsapp_official_account_id, provider, provider_conversation_id,
           last_message_preview, last_message_at, unread_count
         ) VALUES (
           $1::uuid, NULL, $2, $3, $4::uuid, 'whatsapp_official', $2,
           $5, NOW(), 0
         ) RETURNING id::text`,
        [params.inboxUserId, extId, phoneDigits || null, params.accountId, params.text.slice(0, 240)]
      );
      conversationId = ins.rows[0]!.id;
    } else {
      conversationId = conv.rows[0]!.id;
      await client.query(
        `UPDATE chat_conversations SET
           last_message_preview = $2, last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid`,
        [conversationId, params.text.slice(0, 240)]
      );
    }

    if (wamid) {
      await client.query(
        `INSERT INTO chat_messages (
           conversation_id, direction, external_message_id, body, media, status, sent_at, metadata, provider
         ) VALUES (
           $1::uuid, 'outgoing', $2, $3, '[]'::jsonb, 'sent', NOW(),
           jsonb_build_object('source', 'whatsapp_official', 'wamid', $2),
           'whatsapp_official'
         )
         ON CONFLICT (conversation_id, external_message_id) DO NOTHING`,
        [conversationId, wamid, params.text]
      );
    }

    await client.query('COMMIT');
    return { ok: true, wamid };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
