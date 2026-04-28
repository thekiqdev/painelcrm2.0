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
