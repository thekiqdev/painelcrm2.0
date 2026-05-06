/**
 * Registro de gateways: gateway_key → factory (config → PaymentGateway | null).
 * Usado pelo gatewayResolver para obter a instância do gateway.
 */
import type { PaymentGateway } from './paymentGatewayTypes.js';
import type { PaymentGatewayConfigRow } from '../../services/paymentGatewayConfigService.js';

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
  return factory({
    credentials: config.credentials ?? {},
    options: config.options ?? {},
  });
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

// Registrar Asaas (único gateway implementado)
import { getAsaasGateway } from '../gateways/asaas/index.js';

registerGateway('asaas', (config) => {
  const cred = credentialsToAsaasConfig(config.credentials);
  const opts = (config.options ?? {}) as Record<string, unknown>;
  const disableCustomerNotifications = opts.asaas_disable_customer_notifications !== false;
  return getAsaasGateway({
    ...cred,
    disableCustomerNotifications,
  });
});
