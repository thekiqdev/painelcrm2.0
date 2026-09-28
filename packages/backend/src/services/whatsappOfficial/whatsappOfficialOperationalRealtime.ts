import { pool } from '../../utils/db.js';
import { getTenantIdForUser } from '../../utils/tenant.js';
import { contractFromDbRow, ensurePlainString } from '../../utils/chatMessageContract.js';
import {
  emitConversationUpdate,
  emitMessageUpdated,
  emitNewMessage,
} from '../websocketService.js';
import {
  buildConversationUpdatedPayload,
  buildMessageCreatedPayload,
} from '../communication/realtimePayloads.js';
import { emitToTenant } from '../realtimeService.js';
import { DEFAULT_COMMUNICATION_PROVIDER } from '../communication/communicationTypes.js';
import * as notificationService from '../notifications.js';

async function fetchConversationForOperationalWs(conversationId: string): Promise<Record<string, unknown> | null> {
  const r = await pool.query(
    `
    SELECT
      c.*,
      COALESCE(i.name, wa.display_phone_number, wa.verified_name, 'WhatsApp Oficial') AS instance_name
    FROM chat_conversations c
    LEFT JOIN chat_instances i ON i.id = c.instance_id
    LEFT JOIN whatsapp_official_accounts wa ON wa.id = c.whatsapp_official_account_id
    WHERE c.id = $1::uuid
    `,
    [conversationId]
  );
  return (r.rows[0] as Record<string, unknown>) ?? null;
}

/**
 * Após inbound Cloud API persistido — atualiza lista/thread como webhook UazAPI.
 */
export async function emitOperationalOfficialInbound(params: {
  inboxUserId: string;
  conversationId: string;
  messageId: string | null;
}): Promise<void> {
  const tenantId = await getTenantIdForUser(params.inboxUserId);
  const conv = await fetchConversationForOperationalWs(params.conversationId);
  if (!conv) return;

  try {
    emitConversationUpdate(params.inboxUserId, conv);
    const rowProv = conv.provider;
    if (tenantId) {
      emitToTenant(
        tenantId,
        'conversation.updated',
        buildConversationUpdatedPayload({
          provider: (rowProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
          conversation_id: String(conv.id),
          last_message_preview: (conv.last_message_preview as string | null) ?? null,
          last_message_at: (conv.last_message_at as Date | string | null) ?? null,
          unread_count: Number(conv.unread_count ?? 0),
          status: (conv.status as string | null) ?? null,
          assigned_user_id: (conv.assigned_to_user_id as string | null) ?? null,
          assigned_team_id: (conv.assigned_team_id as string | null) ?? null,
          display_name: (conv.display_name as string | null) ?? null,
          avatar_url: (conv.avatar_url as string | null) ?? null,
        })
      );
    }
  } catch (e: unknown) {
    console.warn('[OfficialRealtime] emitConversationUpdate failed', (e as Error)?.message);
  }

  if (!params.messageId) return;

  const msgRes = await pool.query(`SELECT * FROM chat_messages WHERE id = $1::uuid`, [params.messageId]);
  const row = msgRes.rows[0];
  if (!row) return;

  try {
    const contract = contractFromDbRow(row);
    emitNewMessage(
      params.inboxUserId,
      {
        id: row.id,
        conversation_id: row.conversation_id,
        direction: row.direction,
        body: row.body,
        sent_at: row.sent_at || new Date(),
        status: row.status,
        external_message_id: row.external_message_id,
        media: row.media,
        message_contract: contract,
        reply_to_message_id: row.reply_to_message_id ?? null,
        reply_to_external_message_id: row.reply_to_external_message_id ?? null,
        reply_preview: row.reply_preview ?? null,
        reply_sender_name: row.reply_sender_name ?? null,
        reply_message_type: row.reply_message_type ?? null,
      },
      params.conversationId
    );
    if (tenantId) {
      const media = Array.isArray(row.media) ? (row.media as Array<Record<string, unknown>>) : [];
      const mediaUrlRaw = media.find((m) => typeof m?.url === 'string' && m.url)?.url;
      emitToTenant(
        tenantId,
        'message.created',
        buildMessageCreatedPayload({
          provider: 'whatsapp_official',
          conversation_id: params.conversationId,
          message_id: row.id != null ? String(row.id) : null,
          direction: String(row.direction ?? ''),
          body: row.body == null ? null : String(row.body),
          message_type: String(contract.kind ?? 'text'),
          media_url: typeof mediaUrlRaw === 'string' ? mediaUrlRaw : null,
          sent_at: row.sent_at || new Date(),
          provider_message_id: row.external_message_id == null ? null : String(row.external_message_id),
          reply_to_message_id:
            row.reply_to_message_id == null ? null : String(row.reply_to_message_id),
          reply_preview: row.reply_preview == null ? null : String(row.reply_preview),
          reply_sender_name: row.reply_sender_name == null ? null : String(row.reply_sender_name),
          reply_message_type:
            row.reply_message_type == null ? null : String(row.reply_message_type),
        })
      );
    }

    if (String(row.direction ?? '') === 'incoming') {
      try {
        const cn =
          (typeof conv.contact_name === 'string' && conv.contact_name.trim()
            ? conv.contact_name
            : null) ||
          (typeof conv.display_name === 'string' && conv.display_name.trim()
            ? conv.display_name
            : null);
        const phone =
          typeof conv.phone_number === 'string' && conv.phone_number.trim()
            ? conv.phone_number.trim()
            : undefined;
        await notificationService.notifyNewMessage(params.inboxUserId, {
          conversationId: params.conversationId,
          conversationName: cn ?? undefined,
          phoneNumber: phone,
          messagePreview: ensurePlainString(row.body ?? ''),
          messageId:
            row.external_message_id == null ? undefined : String(row.external_message_id),
          isGroup: false,
        });
      } catch (ne: unknown) {
        console.warn('[OfficialRealtime] notifyNewMessage failed', (ne as Error)?.message);
      }
    }
  } catch (e: unknown) {
    console.warn('[OfficialRealtime] emitNewMessage failed', (e as Error)?.message);
  }
}

/**
 * Após webhook de status (sent/delivered/read) na mensagem oficial.
 */
export async function emitOperationalOfficialMessageStatus(wamid: string): Promise<void> {
  const r = await pool.query(
    `
    SELECT m.*, c.user_id AS conv_owner_id
    FROM chat_messages m
    INNER JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE m.external_message_id = $1 AND m.provider = 'whatsapp_official'
    LIMIT 1
    `,
    [wamid]
  );
  const row = r.rows[0];
  if (!row) return;
  const uid = row.conv_owner_id as string;
  const full = await pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [row.id]);
  const msg = full.rows[0];
  if (!msg) return;
  try {
    const contract = contractFromDbRow(msg);
    emitMessageUpdated(
      uid,
      {
        id: msg.id,
        conversation_id: msg.conversation_id,
        direction: msg.direction,
        body: msg.body,
        sent_at: msg.sent_at,
        status: msg.status,
        external_message_id: msg.external_message_id,
        media: msg.media,
        message_contract: contract,
      },
      msg.conversation_id
    );
  } catch (e: unknown) {
    console.warn('[OfficialRealtime] emitMessageUpdated failed', (e as Error)?.message);
  }
}
