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

/**
 * Envio WhatsApp do motor da PLATAFORMA: usa token da instância já validada
 * (Super Admin + `chat_instances` designada em superadmin_settings).
 * Não valida tenant CRM — domínio separado do `dispatchWhatsAppText` dos tenants.
 */
export async function dispatchPlatformWhatsAppPixCopyPasteButton(params: {
  instanceToken: string;
  phone: string;
  pixCopyPaste: string;
  pixDisplayName?: string;
}): Promise<WhatsAppDispatchResult> {
  const number = params.phone.replace(/\D/g, '');
  if (!number) {
    return { ok: false, error: 'Telefone inválido para botão PIX.' };
  }
  const code = params.pixCopyPaste.trim();
  const name = (params.pixDisplayName ?? 'Pix').trim() || 'Pix';
  const base: Record<string, unknown> = {
    number,
    readchat: false,
    readmessages: false,
    delay: 0,
    track_source: 'painelcrm-platform-notifications-pix',
    pixName: name,
  };
  const isEmv = /^000201[0-9A-Za-z]+$/.test(code) && code.length >= 32;
  const primary: Record<string, unknown> = isEmv ? { ...base, pixCode: code } : { ...base, pixType: 'EVP', pixKey: code };

  const parseResponse = (messageResponse: {
    id?: string;
    messageId?: string;
    key?: { id?: string };
  }): WhatsAppDispatchResult => {
    const providerMessageId =
      messageResponse?.id ||
      messageResponse?.messageId ||
      messageResponse?.key?.id ||
      randomUUID();
    return { ok: true, providerMessageId: String(providerMessageId) };
  };

  try {
    const messageResponse = (await uazapiService.sendPixButton(params.instanceToken, primary)) as {
      id?: string;
      messageId?: string;
      key?: { id?: string };
    };
    return parseResponse(messageResponse);
  } catch (e: unknown) {
    if (isEmv) {
      try {
        const fallback = { ...base, pixType: 'EVP', pixKey: code };
        const messageResponse = (await uazapiService.sendPixButton(params.instanceToken, fallback)) as {
          id?: string;
          messageId?: string;
          key?: { id?: string };
        };
        return parseResponse(messageResponse);
      } catch (e2: unknown) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        return { ok: false, error: msg.slice(0, 500) };
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

export async function dispatchPlatformWhatsAppText(params: {
  instanceToken: string;
  phone: string;
  text: string;
}): Promise<WhatsAppDispatchResult> {
  const outboundText = normalizeWhatsAppOutboundPlainText(params.text);

  try {
    const messageResponse = (await uazapiService.sendTextMessage(params.instanceToken, {
      number: params.phone,
      text: outboundText,
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: 'painelcrm-platform-notifications',
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
