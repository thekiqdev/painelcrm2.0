/**
 * Billing 2.0 Sprint 11 — capabilities por gateway (core não conhece vendor HTTP).
 * Policy / renewal consultam capabilities; adapters declaram o que suportam.
 */

export type GatewayCapabilities = {
  /** PIX avulso (QR / copia-e-cola) */
  pix: boolean;
  /** Boleto */
  boleto: boolean;
  /** Cartão com PAN no request (checkout) */
  creditCard: boolean;
  /** Tokenização / captura com creditCardToken (S9) */
  cardToken: boolean;
  /** Pix Automático / débito autorizado (S10) */
  pixAutomatic: boolean;
  /** getPayment / reconciliação L2 */
  getPayment: boolean;
  /** updateCharge */
  updateCharge: boolean;
  /** cancelPayment */
  cancelPayment: boolean;
  /** Webhook PAYMENT_* via parser registrado */
  webhooks: boolean;
};

export const EMPTY_GATEWAY_CAPABILITIES: GatewayCapabilities = {
  pix: false,
  boleto: false,
  creditCard: false,
  cardToken: false,
  pixAutomatic: false,
  getPayment: false,
  updateCharge: false,
  cancelPayment: false,
  webhooks: false,
};

/** Catálogo estático — espelha adapters registrados (não consulta HTTP). */
export const GATEWAY_CAPABILITIES_CATALOG: Record<string, GatewayCapabilities> = {
  asaas: {
    pix: true,
    boleto: true,
    creditCard: true,
    cardToken: true,
    pixAutomatic: true,
    getPayment: true,
    updateCharge: true,
    cancelPayment: true,
    webhooks: true,
  },
  /** Skeleton S11 — registrado, inerte até implementação real + flag multi_gateway */
  stripe: {
    pix: false,
    boleto: false,
    creditCard: true,
    cardToken: true,
    pixAutomatic: false,
    getPayment: true,
    updateCharge: false,
    cancelPayment: true,
    webhooks: true,
  },
};

export function getGatewayCapabilities(gatewayKey: string): GatewayCapabilities {
  const key = (gatewayKey || '').trim().toLowerCase();
  return GATEWAY_CAPABILITIES_CATALOG[key] ?? { ...EMPTY_GATEWAY_CAPABILITIES };
}

export function gatewaySupports(
  gatewayKey: string,
  capability: keyof GatewayCapabilities
): boolean {
  return getGatewayCapabilities(gatewayKey)[capability] === true;
}

export function listGatewayCapabilityCatalog(): Array<{
  gateway_key: string;
  capabilities: GatewayCapabilities;
}> {
  return Object.entries(GATEWAY_CAPABILITIES_CATALOG).map(([gateway_key, capabilities]) => ({
    gateway_key,
    capabilities,
  }));
}
