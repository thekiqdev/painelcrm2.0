/**
 * Resolve o gateway de pagamento ativo a partir do contexto (tenantId, billingType).
 * Fase 3: considera apenas configs com status = 'active' (além de is_active).
 */
import type { PaymentGateway, GatewayProviderContext, BillingType } from './paymentGatewayTypes.js';
import { getActiveConfig } from '../../services/paymentGatewayConfigService.js';
import { buildGateway } from './gatewayRegistry.js';
import { getAsaasGateway } from '../gateways/asaas/index.js';

const cache = new Map<string, PaymentGateway>();
const testOverrides = new Map<string, PaymentGateway>();

function cacheKey(billingType: BillingType, tenantId: string | undefined): string {
  return `${billingType}:${tenantId ?? 'global'}`;
}

/**
 * Para testes: define o gateway a retornar para um contexto. invalidateResolverCache() limpa.
 */
export function setResolverTestOverride(
  billingType: BillingType,
  tenantId: string | undefined,
  gateway: PaymentGateway | null
): void {
  const key = cacheKey(billingType, tenantId);
  if (gateway) testOverrides.set(key, gateway);
  else testOverrides.delete(key);
}

/**
 * Retorna a instância do gateway para o contexto.
 * Usa config do banco; para saas sem config, fallback para variáveis de ambiente (Asaas).
 */
export async function resolvePaymentGateway(
  context?: GatewayProviderContext
): Promise<PaymentGateway | null> {
  const billingType: BillingType = context?.billingType ?? 'saas';
  const tenantId = context?.tenantId;
  if (billingType === 'crm' && !tenantId) return null;

  const key = cacheKey(billingType, tenantId);
  const override = testOverrides.get(key);
  if (override) return override;

  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const config = await getActiveConfig(billingType, tenantId);

    // [DIAG] Resolução do gateway (plan-purchase PIX)
    console.log('[DIAG gatewayResolver]', {
      billingType,
      tenantId: tenantId ?? 'global',
      hasConfig: !!config,
      gateway_key: config?.gateway_key ?? null,
      env: config?.credentials && typeof config.credentials === 'object' && 'env' in config.credentials ? config.credentials.env : null,
      hasApiKey: !!(config?.credentials && typeof config.credentials === 'object' && 'api_key' in config.credentials && config.credentials.api_key),
    });

    if (config && config.credentials && typeof config.credentials?.api_key === 'string' && config.credentials.api_key) {
      const gateway = buildGateway(config.gateway_key, config);
      if (gateway) {
        cache.set(key, gateway);
        return gateway;
      }
    }

    if (!config && billingType === 'saas') {
      const gateway = getAsaasGateway();
      if (gateway) {
        cache.set(key, gateway);
        return gateway;
      }
    }

    return null;
  } catch (err) {
    console.error('[DIAG gatewayResolver] error', err);
    return null;
  }
}

/**
 * Invalida o cache do resolver (ex.: após salvar nova config). Limpa também overrides de teste.
 */
export function invalidateResolverCache(): void {
  cache.clear();
  testOverrides.clear();
}
