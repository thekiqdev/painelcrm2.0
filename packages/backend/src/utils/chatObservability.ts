/**
 * Logs estruturados para integração WhatsApp/UazAPI (Etapa 0 — observabilidade).
 * Não envia para sistema externo; apenas stdout JSON para diagnóstico em produção.
 */

export type UazChatLogLevel = 'info' | 'warn' | 'error';

export type UazChatLogFields = {
  event_type: string;
  tenant_id?: string | null;
  user_id?: string | null;
  instance_id?: string | null;
  external_instance_name?: string | null;
  conversation_id?: string | null;
  external_chat_id?: string | null;
  external_message_id?: string | null;
  sync_run_id?: string | null;
  phase?: string | null;
  trigger?: string | null;
  /** Detalhe curto (mensagem de erro ou etapa) */
  detail?: string | null;
  /** Resultado de auto-webhook */
  webhook_result?: 'success' | 'skipped' | 'failed' | 'no_url' | 'auth_error' | 'invalid_payload';
  [key: string]: unknown;
};

const PREFIX = '[UazChat]';

/** Logs detalhados (payloads, dumps): dev, ou produção com UAZAPI_VERBOSE_LOGS=1 */
export function isUazIntegrationVerboseLogs(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.UAZAPI_VERBOSE_LOGS === '1';
}

/** Log extra do payload/headers do webhook (candidatos truncados) — UAZAPI_WEBHOOK_PAYLOAD_DEBUG=1 */
export function isUazWebhookPayloadDebugEnabled(): boolean {
  const v = process.env.UAZAPI_WEBHOOK_PAYLOAD_DEBUG?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Logs por mensagem em `saveMessage` (volume muito alto em sync/webhook). Opt-in: CHAT_VERBOSE_SAVE=1.
 */
export function isChatSaveVerboseLogs(): boolean {
  return process.env.CHAT_VERBOSE_SAVE === '1';
}

export function logUazChat(level: UazChatLogLevel, fields: UazChatLogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...fields });
  if (level === 'error') {
    console.error(PREFIX, line);
  } else if (level === 'warn') {
    console.warn(PREFIX, line);
  } else {
    console.log(PREFIX, line);
  }
}
