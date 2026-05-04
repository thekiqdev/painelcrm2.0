import { pool } from '../../utils/db.js';

function externalChatIdFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length < 8) return `${digits}@s.whatsapp.net`;
  return `${d}@s.whatsapp.net`;
}

/**
 * Mensagem inbound Cloud API → chat_conversations + chat_messages (provider whatsapp_official).
 * Duplicados (mesmo wamid) não incrementam unread nem atualizam preview.
 */
export async function ingestOfficialInboundText(params: {
  accountId: string;
  inboxUserId: string;
  fromPhoneDigits: string;
  wamid: string;
  textBody: string | null;
  timestampSec?: string;
}): Promise<{
  conversationId: string;
  messageId: string | null;
  /** true quando o webhook repetiu o mesmo wamid (idempotência Meta). */
  isDuplicateInbound: boolean;
}> {
  const extId = externalChatIdFromDigits(params.fromPhoneDigits);
  const phoneDigits = params.fromPhoneDigits.replace(/\D/g, '');
  const preview = (params.textBody || '').slice(0, 240);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let conv = await client.query<{ id: string }>(
      `SELECT id::text FROM chat_conversations
       WHERE whatsapp_official_account_id = $1::uuid AND external_chat_id = $2
       LIMIT 1`,
      [params.accountId, extId]
    );

    let conversationId: string;
    if (conv.rows.length === 0) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO chat_conversations (
           user_id, instance_id, external_chat_id, phone_number,
           whatsapp_official_account_id, provider, provider_conversation_id,
           contact_name, last_message_preview, last_message_at, unread_count
         ) VALUES (
           $1::uuid, NULL, $2, $3, $4::uuid, 'whatsapp_official', $2,
           NULL, NULL, NULL, 0
         ) RETURNING id::text`,
        [params.inboxUserId, extId, phoneDigits || null, params.accountId]
      );
      conversationId = ins.rows[0]!.id;
    } else {
      conversationId = conv.rows[0]!.id;
    }

    const ts =
      params.timestampSec && /^\d+$/.test(params.timestampSec)
        ? new Date(parseInt(params.timestampSec, 10) * 1000)
        : new Date();

    const msg = await client.query<{ id: string }>(
      `INSERT INTO chat_messages (
         conversation_id, direction, external_message_id, body, media, status, sent_at, metadata, provider
       ) VALUES (
         $1::uuid, 'incoming', $2, $3, '[]'::jsonb, 'delivered', $4,
         jsonb_build_object('source', 'whatsapp_official', 'wamid', $2),
         'whatsapp_official'
       )
       ON CONFLICT (conversation_id, external_message_id) DO NOTHING
       RETURNING id::text`,
      [conversationId, params.wamid, params.textBody, ts]
    );

    const insertedId = msg.rows[0]?.id ?? null;
    const isDuplicateInbound = !insertedId;

    let messageId: string | null = insertedId;

    if (isDuplicateInbound) {
      const ex = await client.query<{ id: string }>(
        `SELECT id::text FROM chat_messages
         WHERE conversation_id = $1::uuid AND external_message_id = $2
         LIMIT 1`,
        [conversationId, params.wamid]
      );
      messageId = ex.rows[0]?.id ?? null;
    } else {
      await client.query(
        `UPDATE chat_conversations SET
           last_message_preview = $2,
           last_message_at = NOW(),
           unread_count = unread_count + 1,
           updated_at = NOW()
         WHERE id = $1::uuid`,
        [conversationId, preview]
      );
    }

    await client.query('COMMIT');
    return { conversationId, messageId, isDuplicateInbound };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateOutgoingStatusByWamid(params: {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  conversationHintAccountId?: string;
}): Promise<number> {
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };
  const st = statusMap[params.status] || params.status;
  const r = await pool.query(
    `UPDATE chat_messages SET status = $2, metadata = metadata || jsonb_build_object('wa_status', $2::text)
     WHERE external_message_id = $1 AND provider = 'whatsapp_official'`,
    [params.wamid, st]
  );
  return r.rowCount ?? 0;
}
