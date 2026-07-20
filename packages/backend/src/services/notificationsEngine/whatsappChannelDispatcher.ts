import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { uazapiService } from '../uazapi.js';
import {
  extractUazapiErrorStatus,
  isUazapiInvalidTokenSignal,
  markChatInstanceDisconnectedForInvalidToken,
} from '../chatInstanceInvalidTokenSelfHeal.js';
import {
  CHAT_INSTANCE_OPERABLE_STATUS_SQL,
  isChatInstanceStatusOperable,
  isUazWhatsAppDisconnectedSignal,
} from '../chatInstanceOperableStatus.js';
import { refreshChatInstanceStatusFromUaz } from '../refreshChatInstanceStatusFromUaz.js';

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
  | { ok: true; providerMessageId: string; chatInstanceId?: string }
  | { ok: false; error: string };

type InstanceRow = {
  id: string;
  instance_token: string;
  user_id: string;
  external_instance_name: string | null;
  status: string;
};

async function loadInstanceForDispatch(
  pool: Pool,
  senderUserId: string,
): Promise<InstanceRow | null> {
  const operable = await pool.query<InstanceRow>(
    `SELECT i.id, i.instance_token, i.user_id, i.external_instance_name, i.status
     FROM chat_instances i
     WHERE i.user_id = $1 AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 1`,
    [senderUserId],
  );
  if (operable.rows[0]) return operable.rows[0];

  const any = await pool.query<InstanceRow>(
    `SELECT i.id, i.instance_token, i.user_id, i.external_instance_name, i.status
     FROM chat_instances i
     WHERE i.user_id = $1
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 1`,
    [senderUserId],
  );
  return any.rows[0] ?? null;
}

async function loadInstanceByIdForTenant(
  pool: Pool,
  tenantId: string,
  chatInstanceId: string,
): Promise<InstanceRow | null> {
  const r = await pool.query<InstanceRow>(
    `SELECT i.id, i.instance_token, i.user_id, i.external_instance_name, i.status
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [chatInstanceId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function sendWithToken(
  token: string,
  phone: string,
  outboundText: string,
): Promise<{ id?: string; messageId?: string; key?: { id?: string } }> {
  return (await uazapiService.sendTextMessage(token, {
    number: phone,
    text: outboundText,
    readchat: false,
    readmessages: false,
    delay: 0,
    track_source: 'painelcrm-notifications-engine',
  })) as { id?: string; messageId?: string; key?: { id?: string } };
}

function providerMessageIdFromResponse(messageResponse: {
  id?: string;
  messageId?: string;
  key?: { id?: string };
}): string {
  return String(
    messageResponse?.id ||
      messageResponse?.messageId ||
      messageResponse?.key?.id ||
      randomUUID(),
  );
}

/**
 * Envia texto WhatsApp via UazAPI usando instância operable do utilizador remetente.
 * Refresh live de status (SSOT) antes do send; um retry após refresh em 503 disconnected.
 */
export async function dispatchWhatsAppText(params: {
  pool: Pool;
  tenantId: string;
  senderUserId: string;
  phone: string;
  text: string;
  /** WR1: forçar instância (ex.: routing de faturas). */
  chatInstanceId?: string | null;
}): Promise<WhatsAppDispatchResult> {
  let senderUserId = params.senderUserId;
  const member = await params.pool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
    senderUserId,
    params.tenantId,
  ]);
  if (member.rows.length === 0) {
    return { ok: false, error: 'Remetente não pertence à empresa.' };
  }

  let instanceRow: InstanceRow | null = null;
  if (params.chatInstanceId) {
    instanceRow = await loadInstanceByIdForTenant(params.pool, params.tenantId, params.chatInstanceId);
    if (!instanceRow) {
      return { ok: false, error: 'Instância WhatsApp de roteamento não encontrada nesta conta.' };
    }
    senderUserId = instanceRow.user_id;
    const ownerOk = await params.pool.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      senderUserId,
      params.tenantId,
    ]);
    if (ownerOk.rows.length === 0) {
      return { ok: false, error: 'Dono da instância WhatsApp não pertence à empresa.' };
    }
  } else {
    instanceRow = await loadInstanceForDispatch(params.pool, senderUserId);
  }
  if (!instanceRow) {
    return { ok: false, error: 'Nenhuma instância WhatsApp ativa encontrada para o utilizador.' };
  }

  try {
    const refreshed = await refreshChatInstanceStatusFromUaz(params.pool, {
      instanceId: instanceRow.id,
      instanceToken: instanceRow.instance_token,
      currentStatus: instanceRow.status,
      source: 'dispatch_whatsapp_text_preflight',
    });
    instanceRow = { ...instanceRow, status: refreshed.status };
    if (!refreshed.operable) {
      return {
        ok: false,
        error: `Instância WhatsApp não está conectada (status=${refreshed.status}). Atualize a conexão e tente novamente.`,
      };
    }
  } catch (refreshErr: unknown) {
    const refreshMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
    const refreshStatus = extractUazapiErrorStatus(refreshErr);
    if (isUazapiInvalidTokenSignal(refreshMsg, refreshStatus)) {
      try {
        await markChatInstanceDisconnectedForInvalidToken(params.pool, {
          instanceId: instanceRow.id,
          userId: instanceRow.user_id,
          tenantId: params.tenantId,
          externalInstanceName: instanceRow.external_instance_name,
          reason: refreshMsg,
          source: 'dispatch_whatsapp_text',
        });
      } catch (healErr: unknown) {
        const healMsg = healErr instanceof Error ? healErr.message : String(healErr);
        console.error('[chat_instance_health]', JSON.stringify({ action: 'self_heal_failed', error: healMsg }));
      }
      return { ok: false, error: refreshMsg.slice(0, 500) };
    }
    // Status check falhou (rede etc.): se DB já era operable, tenta send; senão aborta.
    if (!isChatInstanceStatusOperable(instanceRow.status)) {
      return {
        ok: false,
        error: `Não foi possível verificar o estado da instância WhatsApp: ${refreshMsg.slice(0, 400)}`,
      };
    }
    console.warn(
      '[notifications-engine] status_refresh_failed_continuing_with_db_status',
      JSON.stringify({
        instanceId: instanceRow.id,
        status: instanceRow.status,
        error: refreshMsg.slice(0, 240),
      }),
    );
  }

  const outboundText = normalizeWhatsAppOutboundPlainText(params.text);

  const attemptSend = async (): Promise<WhatsAppDispatchResult> => {
    const messageResponse = await sendWithToken(instanceRow!.instance_token, params.phone, outboundText);
    return {
      ok: true,
      providerMessageId: providerMessageIdFromResponse(messageResponse),
      chatInstanceId: instanceRow!.id,
    };
  };

  try {
    return await attemptSend();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const httpStatus = extractUazapiErrorStatus(e);

    if (isUazapiInvalidTokenSignal(msg, httpStatus)) {
      try {
        await markChatInstanceDisconnectedForInvalidToken(params.pool, {
          instanceId: instanceRow.id,
          userId: instanceRow.user_id,
          tenantId: params.tenantId,
          externalInstanceName: instanceRow.external_instance_name,
          reason: msg,
          source: 'dispatch_whatsapp_text',
        });
      } catch (healErr: unknown) {
        const healMsg = healErr instanceof Error ? healErr.message : String(healErr);
        console.error('[chat_instance_health]', JSON.stringify({ action: 'self_heal_failed', error: healMsg }));
      }
      return { ok: false, error: msg.slice(0, 500) };
    }

    if (isUazWhatsAppDisconnectedSignal(msg, httpStatus)) {
      try {
        const again = await refreshChatInstanceStatusFromUaz(params.pool, {
          instanceId: instanceRow.id,
          instanceToken: instanceRow.instance_token,
          currentStatus: instanceRow.status,
          source: 'dispatch_whatsapp_text_after_disconnected',
        });
        instanceRow = { ...instanceRow, status: again.status };
        if (again.operable) {
          try {
            return await attemptSend();
          } catch (retryErr: unknown) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            return { ok: false, error: retryMsg.slice(0, 500) };
          }
        }
        return {
          ok: false,
          error: `WhatsApp disconnected (status=${again.status}). Atualize a conexão e tente novamente.`,
        };
      } catch {
        return { ok: false, error: msg.slice(0, 500) || 'WhatsApp disconnected' };
      }
    }

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
