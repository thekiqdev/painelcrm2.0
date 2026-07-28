/**
 * Resolve o gateway de pagamento ativo a partir do contexto (tenantId, billingType).
 * Fase 3: considera apenas configs com status = 'active' (além de is_active).
 * Sprint 11: gateway ≠ asaas no SaaS exige billing2.multi_gateway=ON; senão fallback Asaas.
 */
import type { PaymentGateway, GatewayProviderContext, BillingType } from './paymentGatewayTypes.js';
import { getActiveConfig } from '../../services/paymentGatewayConfigService.js';
import { buildGateway } from './gatewayRegistry.js';
import { getAsaasGateway } from '../gateways/asaas/index.js';
import { getGatewayCapabilities } from './gatewayCapabilities.js';

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

async function isMultiGatewayEnabled(): Promise<boolean> {
  try {
    const { isBilling2FlagEnabled } = await import('../../services/billing2/billingFeatureFlags.js');
    return await isBilling2FlagEnabled('multi_gateway');
  } catch {
    return false;
  }
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

    console.log('[DIAG gatewayResolver]', {
      billingType,
      tenantId: tenantId ?? 'global',
      hasConfig: !!config,
      gateway_key: config?.gateway_key ?? null,
      env:
        config?.credentials && typeof config.credentials === 'object' && 'env' in config.credentials
          ? config.credentials.env
          : null,
      hasApiKey: !!(
        config?.credentials &&
        typeof config.credentials === 'object' &&
        'api_key' in config.credentials &&
        config.credentials.api_key
      ),
    });

    if (
      config &&
      config.credentials &&
      typeof config.credentials?.api_key === 'string' &&
      config.credentials.api_key
    ) {
      const gatewayKey = (config.gateway_key || '').trim().toLowerCase();

      // SaaS: 2º gateway só se flag multi_gateway ON (default OFF → Asaas).
      if (billingType === 'saas' && gatewayKey && gatewayKey !== 'asaas') {
        const multi = await isMultiGatewayEnabled();
        if (!multi) {
          console.warn(
            '[gatewayResolver] billing2.multi_gateway OFF — ignorando gateway_key=%s; fallback Asaas',
            gatewayKey
          );
          const asaasFallback = getAsaasGateway();
          if (asaasFallback) {
            asaasFallback.capabilities = getGatewayCapabilities('asaas');
            cache.set(key, asaasFallback);
            return asaasFallback;
          }
          return null;
        }
      }

      const gateway = buildGateway(config.gateway_key, config);
      if (gateway) {
        cache.set(key, gateway);
        return gateway;
      }
    }

    if (!config && billingType === 'saas') {
      const gateway = getAsaasGateway();
      if (gateway) {
        gateway.capabilities = getGatewayCapabilities('asaas');
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
