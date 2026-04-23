import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { uazapiService } from '../uazapi.js';

/**
 * Normalização final de texto WhatsApp (motor transacional + overrides).
 * - CRLF → LF
 * - limpa espaços/tab no início/fim de cada linha e colapsa espaços múltiplos na linha
 * - no máximo uma linha em branco entre blocos (evita “paredes” de espaço vazio)
 * - trim só no início/fim da mensagem completa
 *
 * Markdown simples (*negrito*) dos templates não é alterado — só espaçamento bruto.
 */
export function normalizeWhatsAppOutboundPlainText(raw: string): string {
  let s = String(raw ?? '');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = s.split('\n').map((line) => {
    const noMultiSpace = line.replace(/[ \t]{2,}/g, ' ');
    return noMultiSpace.replace(/^[ \t]+|[ \t]+$/g, '');
  });
  s = lines.join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export type WhatsAppDispatchResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

/**
 * Envia texto WhatsApp via UazAPI usando instância conectada do utilizador remetente.
 */
export async function dispatchWhatsAppText(params: {
  pool: Pool;
  tenantId: string;
  senderUserId: string;
  phone: string;
  text: string;
}): Promise<WhatsAppDispatchResult> {
  const member = await params.pool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
    params.senderUserId,
    params.tenantId,
  ]);
  if (member.rows.length === 0) {
    return { ok: false, error: 'Remetente não pertence ao tenant.' };
  }

  const instanceResult = await params.pool.query<{ instance_token: string }>(
    `SELECT i.instance_token
     FROM chat_instances i
     WHERE i.user_id = $1 AND i.status = 'connected'
     LIMIT 1`,
    [params.senderUserId],
  );

  if (instanceResult.rows.length === 0) {
    return { ok: false, error: 'Nenhuma instância WhatsApp ativa encontrada para o utilizador.' };
  }

  const token = instanceResult.rows[0]!.instance_token;

  const outboundText = normalizeWhatsAppOutboundPlainText(params.text);

  try {
    const messageResponse = (await uazapiService.sendTextMessage(token, {
      number: params.phone,
      text: outboundText,
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: 'painelcrm-notifications-engine',
    })) as { id?: string; messageId?: string; key?: { id?: string } };

    const providerMessageId =
      messageResponse?.id ||
      messageResponse?.messageId ||
      messageResponse?.key?.id ||
      randomUUID();

    return { ok: true, providerMessageId: String(providerMessageId) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  }
}
