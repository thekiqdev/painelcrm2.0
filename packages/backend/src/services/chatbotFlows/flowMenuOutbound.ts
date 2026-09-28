/**
 * Envio de menu interativo no runtime Chatbot Flows (S13).
 * Tenta UazAPI `/send/menu`; se falhar, degrada para texto numerado.
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../../utils/db.js';
import { uazapiService } from '../uazapi.js';
import { buildMenuTextFallback, type MenuChoiceOption } from './menuChoiceHelpers.js';

function toUazRecipientNumber(
  phone: string | null | undefined,
  externalChatId: string | null | undefined
): string {
  const raw = String(phone || externalChatId || '').trim();
  if (!raw) return raw;
  if (raw.endsWith('@g.us') || raw.endsWith('@broadcast')) return raw;
  if (raw.endsWith('@s.whatsapp.net')) return raw.replace(/@s\.whatsapp\.net$/i, '');
  if (raw.endsWith('@c.us')) return raw.replace(/@c\.us$/i, '');
  return raw;
}

async function degradeToText(opts: {
  conversationId: string;
  actorUserId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string; degradedToText: true }> {
  const { sendKanbanAutomationOutboundText } = await import(
    '../../controllers/chatController.js'
  );
  const r = await sendKanbanAutomationOutboundText({
    conversationId: opts.conversationId,
    actorUserId: opts.actorUserId,
    text: opts.text,
    metadataSource: 'chatbot_flows_runtime',
  });
  return { ...r, degradedToText: true };
}

export async function sendChatbotFlowOutboundMenu(opts: {
  conversationId: string;
  actorUserId: string;
  mode: 'button' | 'list';
  text: string;
  footerText?: string;
  listButton?: string;
  choices: string[];
  options: MenuChoiceOption[];
}): Promise<{ ok: boolean; error?: string; degradedToText?: boolean }> {
  const text = String(opts.text || '').trim();
  const degraded = buildMenuTextFallback(text, opts.options);

  try {
    const conversationResult = await pool.query(
      `SELECT c.id, c.phone_number, c.canonical_phone, c.external_chat_id,
              i.instance_token, i.status AS instance_status
       FROM chat_conversations c
       INNER JOIN chat_instances i ON i.id = c.instance_id
       WHERE c.id = $1::uuid AND c.user_id = $2::uuid
       LIMIT 1`,
      [opts.conversationId, opts.actorUserId]
    );
    const conversation = conversationResult.rows[0] as
      | {
          phone_number?: string;
          canonical_phone?: string;
          external_chat_id?: string;
          instance_token?: string;
          instance_status?: string;
        }
      | undefined;

    if (!conversation?.instance_token) {
      return degradeToText({
        conversationId: opts.conversationId,
        actorUserId: opts.actorUserId,
        text: degraded,
      });
    }

    const instStatus = String(conversation.instance_status || '').toLowerCase();
    if (instStatus !== 'connected' && instStatus !== 'open') {
      return { ok: false, error: 'whatsapp_not_connected' };
    }

    const numberTo = toUazRecipientNumber(
      conversation.canonical_phone || conversation.phone_number,
      conversation.external_chat_id || null
    );
    if (!numberTo) return { ok: false, error: 'no_recipient_number' };

    const trackId = `flow_menu_${randomUUID()}`;
    const payload: Record<string, unknown> = {
      number: numberTo,
      type: opts.mode,
      text: text || 'Escolha uma opção:',
      choices: opts.choices,
      track_source: 'painelcrm_chatbot_flows',
      track_id: trackId,
    };
    if (opts.footerText?.trim()) payload.footerText = opts.footerText.trim();
    if (opts.mode === 'list') {
      payload.listButton = (opts.listButton || 'Ver opções').trim() || 'Ver opções';
    }

    await uazapiService.sendMenu(String(conversation.instance_token), payload);

    try {
      await pool.query(
        `INSERT INTO chat_messages (conversation_id, direction, body, status, sent_at, metadata)
         VALUES ($1::uuid, 'outgoing', $2, 'sent', now(), $3::jsonb)`,
        [
          opts.conversationId,
          text || degraded,
          JSON.stringify({
            source: 'chatbot_flows_runtime',
            menu: { mode: opts.mode, choices: opts.choices },
            track_id: trackId,
          }),
        ]
      );
    } catch (persistErr) {
      console.warn(
        '[chatbot_flows_menu] persist skipped',
        persistErr instanceof Error ? persistErr.message : persistErr
      );
    }

    return { ok: true };
  } catch (e) {
    console.warn(
      '[chatbot_flows_menu] sendMenu failed, degrading to text',
      e instanceof Error ? e.message : e
    );
    return degradeToText({
      conversationId: opts.conversationId,
      actorUserId: opts.actorUserId,
      text: degraded,
    });
  }
}
