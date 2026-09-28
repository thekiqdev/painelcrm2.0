/**
 * Webhook UazAPI — registo por path (v2) vs query legacy (v1).
 *
 * v2 (predefinição): POST .../api/webhooks/uazapi/v2/:chatInstanceId/:webhookToken
 * Identificação determinística pela URL; `chat_instances.webhook_secret` é o token no path.
 *
 * v1 (compatibilidade): ...?instanceId=&secret= — ativar só se necessário:
 * UAZAPI_WEBHOOK_LEGACY_QUERY_URL=true
 */
export function useLegacyQueryWebhookUrlRegistration(): boolean {
  const v = process.env.UAZAPI_WEBHOOK_LEGACY_QUERY_URL?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}
