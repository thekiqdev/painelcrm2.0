/**
 * Rate limit para POST .../payment-gateway/test: máx 5 requisições por minuto por chave (tenantId ou 'superadmin').
 * Fase 3 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const store = new Map<string, { count: number; resetAt: number }>();

export function checkPaymentGatewayTestRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now >= entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + WINDOW_MS;
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_REQUESTS;
}
