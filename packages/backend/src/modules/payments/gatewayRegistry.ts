/**
 * Registro de gateways: gateway_key → factory (config → PaymentGateway | null).
 * Usado pelo gatewayResolver para obter a instância do gateway.
 * Sprint 11 — Asaas (produção) + Stripe skeleton (flag multi_gateway).
 */
import type { PaymentGateway } from './paymentGatewayTypes.js';
import type { PaymentGatewayConfigRow } from '../../services/paymentGatewayConfigService.js';
import { getGatewayCapabilities } from './gatewayCapabilities.js';

export interface GatewayConfig {
  credentials: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export type GatewayFactory = (config: GatewayConfig) => PaymentGateway | null;

const registry = new Map<string, GatewayFactory>();

/**
 * Registra uma factory para o gateway_key. Chamado no bootstrap (ou import side-effect).
 */
export function registerGateway(key: string, factory: GatewayFactory): void {
  registry.set(key, factory);
}

/**
 * Retorna a instância do gateway para o gateway_key e config, ou null.
 */
export function buildGateway(
  gatewayKey: string,
  config: Pick<PaymentGatewayConfigRow, 'credentials' | 'options'>
): PaymentGateway | null {
  const factory = registry.get(gatewayKey);
  if (!factory) return null;
  const gw = factory({
    credentials: config.credentials ?? {},
    options: config.options ?? {},
  });
  if (gw && !gw.capabilities) {
    gw.capabilities = getGatewayCapabilities(gatewayKey);
  }
  return gw;
}

/** Keys registradas no processo (para testes / ops). */
export function listRegisteredGatewayKeys(): string[] {
  return Array.from(registry.keys()).sort();
}

export function isGatewayRegistered(gatewayKey: string): boolean {
  return registry.has(gatewayKey);
}

/**
 * Converte credentials (JSON do banco) para AsaasConfig. Uso interno no registro do Asaas.
 */
export function credentialsToAsaasConfig(credentials: Record<string, unknown>): {
  api_key: string;
  env?: 'sandbox' | 'production';
} {
  const api_key = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  const env = credentials.env === 'production' ? 'production' : 'sandbox';
  return { api_key, env };
}

function credentialsToStripeConfig(credentials: Record<string, unknown>): {
  api_key: string;
  env?: 'sandbox' | 'production';
} {
  const api_key =
    typeof credentials.api_key === 'string'
      ? credentials.api_key
      : typeof credentials.secret_key === 'string'
        ? credentials.secret_key
        : '';
  const env = credentials.env === 'production' ? 'production' : 'sandbox';
  return { api_key, env };
}

// Registrar Asaas (gateway SaaS default)
import { getAsaasGateway } from '../gateways/asaas/index.js';
import { getGatewayCapabilities as caps } from './gatewayCapabilities.js';

registerGateway('asaas', (config) => {
  const cred = credentialsToAsaasConfig(config.credentials);
  const opts = (config.options ?? {}) as Record<string, unknown>;
  const disableCustomerNotifications = opts.asaas_disable_customer_notifications !== false;
  const gw = getAsaasGateway({
    ...cred,
    disableCustomerNotifications,
  });
  if (gw) gw.capabilities = caps('asaas');
  return gw;
});

// Sprint 11 — Stripe skeleton (inerte até adapter real + multi_gateway ON)
import { getStripeSaasSkeletonGateway } from '../gateways/stripe/index.js';

registerGateway('stripe', (config) => {
  return getStripeSaasSkeletonGateway(credentialsToStripeConfig(config.credentials));
});
