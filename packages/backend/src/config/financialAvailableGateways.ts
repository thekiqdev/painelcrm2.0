/**
 * Fonte única: gateways financeiros (vínculo conta ↔ recebimentos) disponíveis no ambiente.
 * Mercado Pago só entra na lista quando explicitamente activado.
 */
const ALL_KNOWN = [
  { key: 'asaas' as const, label: 'Asaas' },
  { key: 'mercado_pago' as const, label: 'Mercado Pago' },
  { key: 'stripe' as const, label: 'Stripe' },
];

function mercadoPagoEnabled(): boolean {
  const v = process.env.FINANCIAL_GATEWAY_MERCADO_PAGO_ENABLED;
  if (v === undefined || v === '') return false;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

export type FinancialGatewaySelectableKey = (typeof ALL_KNOWN)[number]['key'];

/** Chaves que podem ser seleccionadas e persistidas. Stripe entra só com a flag do tenant. */
export function getAvailableFinancialGatewayKeys(options?: {
  includeStripeTenant?: boolean;
}): FinancialGatewaySelectableKey[] {
  const keys: FinancialGatewaySelectableKey[] = ['asaas'];
  if (mercadoPagoEnabled()) {
    keys.push('mercado_pago');
  }
  if (options?.includeStripeTenant) {
    keys.push('stripe');
  }
  return keys;
}

function normalizeKeyForAvailability(key: string): string {
  return key.trim().toLowerCase();
}

export function isFinancialGatewayKeyAvailable(key: string | null | undefined): boolean {
  if (!key || typeof key !== 'string') return false;
  return (getAvailableFinancialGatewayKeys() as string[]).includes(normalizeKeyForAvailability(key));
}

export function assertFinancialGatewayKeyAvailable(key: string, context = 'gateway'): void {
  if (isFinancialGatewayKeyAvailable(key)) return;
  throw new Error(
    `Gateway "${context}" não está disponível neste ambiente. Só é possível usar: ${getAvailableFinancialGatewayKeys().join(', ')}.`
  );
}

/** Resposta GET /api/financial/gateways/available */
export async function getFinancialGatewaysAvailablePayload(): Promise<{ key: string; label: string; enabled: true }[]> {
  const { isStripeTenantEnabled } = await import('../modules/gateways/stripe/stripeTenantFlags.js');
  const keys = new Set(getAvailableFinancialGatewayKeys({ includeStripeTenant: await isStripeTenantEnabled() }));
  return ALL_KNOWN.filter((r) => keys.has(r.key)).map((r) => ({
    key: r.key,
    label: r.label,
    enabled: true as const,
  }));
}

export function labelForFinancialGatewayKey(key: string): string {
  return ALL_KNOWN.find((x) => x.key === key)?.label ?? key;
}
