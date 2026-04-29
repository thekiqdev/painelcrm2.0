/**
 * Feature flag e utilitários do gateway Mercado Pago (isolado do Asaas).
 */
export function isMercadoPagoGatewayEnabled(): boolean {
  const v = String(process.env.MERCADO_PAGO_GATEWAY_ENABLED || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function filterMercadoPagoFromTenantGatewayList<T extends { key: string }>(items: T[]): T[] {
  if (isMercadoPagoGatewayEnabled()) return items;
  return items.filter((g) => g.key !== 'mercado_pago');
}

/**
 * Ambiente OAuth pretendido pelo servidor (credenciais da aplicação no painel MP).
 * - production (default): alinhado a apps de produção quando o token não traz live_mode.
 * - sandbox: defina MERCADO_PAGO_OAUTH_ENVIRONMENT=sandbox em desenvolvimento.
 */
export function getMercadoPagoConfiguredOAuthEnvironment(): 'sandbox' | 'production' {
  const v = String(process.env.MERCADO_PAGO_OAUTH_ENVIRONMENT || 'production').trim().toLowerCase();
  if (v === 'sandbox' || v === 'test') return 'sandbox';
  return 'production';
}

export function getMercadoPagoAuthBaseUrl(): string {
  const u = String(process.env.MERCADO_PAGO_AUTH_BASE_URL || '').trim().replace(/\/$/, '');
  if (u) return u;
  return 'https://auth.mercadopago.com.br';
}

/** Base de autorização conforme ambiente (override opcional só para sandbox). */
export function getMercadoPagoAuthBaseUrlForEnvironment(env: 'sandbox' | 'production'): string {
  if (env === 'sandbox') {
    const sandbox = String(process.env.MERCADO_PAGO_SANDBOX_AUTH_BASE_URL || '').trim().replace(/\/$/, '');
    if (sandbox) return sandbox;
  }
  return getMercadoPagoAuthBaseUrl();
}

export function getMercadoPagoFrontendRedirectBase(): string {
  const u =
    String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '') ||
    String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '') ||
    String(process.env.VITE_APP_URL || '').trim().replace(/\/$/, '');
  if (u) return u;
  return 'http://localhost:5173';
}

/**
 * URL de notificação na preferência (Fase 4 webhook). Opcional: não quebra Fase 3 se vazio.
 * Prioridade: MERCADO_PAGO_NOTIFICATION_URL → PUBLIC_API_URL + /api/integrations/mercado-pago/webhook
 * (GET/POST no mesmo path; alias legado: /api/webhooks/mercado-pago)
 */
export function getMercadoPagoPreferenceNotificationUrl(): string | undefined {
  const explicit = String(process.env.MERCADO_PAGO_NOTIFICATION_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const base =
    String(process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '') ||
    String(process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!base) return undefined;
  return `${base}/api/integrations/mercado-pago/webhook`;
}

/**
 * Segredo da assinatura Webhook (painel Mercado Pago → Suas integrações → Webhooks).
 * Sem esta variável, x-signature não é validada (modo compatível), com log explícito.
 */
export function getMercadoPagoWebhookSecret(): string | undefined {
  const s = String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || '').trim();
  return s || undefined;
}

/**
 * Margem de tempo (ms) entre `ts` do header e o relógio do servidor. 0 = não validar.
 * Default 600000 (10 min) para absorver filas e relógios.
 */
export function getMercadoPagoWebhookTsToleranceMs(): number {
  const raw = String(process.env.MERCADO_PAGO_WEBHOOK_TS_TOLERANCE_MS || '').trim();
  if (raw === '' || raw.toLowerCase() === 'default') return 600000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 600000;
  return n;
}
