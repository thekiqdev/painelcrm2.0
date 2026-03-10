/**
 * Fachada de resolução do gateway: delega ao gatewayResolver.
 * Mantém getActiveAsaasConfigForSaas para compatibilidade (ensureCustomerForTenant, etc.).
 */
import type { PaymentGateway, GatewayProviderContext } from './paymentGatewayTypes.js';
import { getActiveConfig } from '../../services/paymentGatewayConfigService.js';
import { resolvePaymentGateway, invalidateResolverCache, setResolverTestOverride } from './gatewayResolver.js';

function cacheKey(billingType: 'saas' | 'crm', tenantId: string | undefined): string {
  return `${billingType}:${tenantId ?? 'global'}`;
}

function credentialsToAsaasConfig(credentials: Record<string, unknown>): { api_key: string; env?: 'sandbox' | 'production' } {
  const api_key = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  const env = credentials.env === 'production' ? 'production' : 'sandbox';
  return { api_key, env };
}

/**
 * Retorna o gateway ativo para o contexto. Usa o Resolver por baixo.
 */
export async function getActiveGateway(
  context?: GatewayProviderContext
): Promise<PaymentGateway | null> {
  return resolvePaymentGateway(context);
}

/**
 * Retorna a config Asaas para o contexto SaaS (config global).
 * Usado por createTenantCharge para passar à ensureCustomerForTenant.
 */
export async function getActiveAsaasConfigForSaas(): Promise<{ api_key: string; env?: 'sandbox' | 'production' } | null> {
  try {
    const config = await getActiveConfig('saas');
    if (config && config.gateway_key === 'asaas' && typeof config.credentials?.api_key === 'string' && config.credentials.api_key) {
      return credentialsToAsaasConfig(config.credentials);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Invalida o cache (ex.: após salvar nova config).
 */
export function invalidateGatewayCache(): void {
  invalidateResolverCache();
}

/**
 * Para testes: define o gateway a retornar para saas (sem tenant).
 */
export function setGatewayForTesting(gateway: PaymentGateway | null): void {
  invalidateGatewayCache();
  setResolverTestOverride('saas', undefined, gateway);
}
