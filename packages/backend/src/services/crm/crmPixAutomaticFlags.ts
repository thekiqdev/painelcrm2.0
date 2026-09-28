/**
 * CRM0 — gate Pix Automático nas faturas/assinaturas de clientes do tenant.
 * Flag plataforma `crm.pix_automatic` (default OFF), separada de `billing2.pix_automatic`.
 */
import { loadAllPlatformFeatureFlags } from '../../platform/featureFlagRepository.js';
import { gatewaySupports } from '../../modules/payments/gatewayCapabilities.js';

export const CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY = 'crm.pix_automatic' as const;

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

/**
 * Precedência: platform_feature_flags → env `CRM_FLAG_PIX_AUTOMATIC` → default false.
 */
export async function isCrmPixAutomaticEnabled(
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  try {
    const rows = await loadAllPlatformFeatureFlags();
    const row = rows.find((r) => r.key === CRM_PIX_AUTOMATIC_PLATFORM_FLAG_KEY);
    if (row) return row.default_enabled === true;
  } catch (e: unknown) {
    console.warn(
      '[crm.pix_automatic] falha ao ler platform_feature_flags; fallback env/default',
      e instanceof Error ? e.message : e
    );
  }
  const fromEnv = parseEnvBool(env.CRM_FLAG_PIX_AUTOMATIC);
  if (fromEnv != null) return fromEnv;
  return false;
}

/**
 * Gate completo para exibir toggle / aceitar pix_automatic na API CRM.
 * Flag OFF ou gateway sem capability → false (fluxo CRM idêntico ao legado).
 */
export async function canOfferCrmPixAutomatic(opts: {
  gatewayKey: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  available: boolean;
  flag_enabled: boolean;
  gateway_supports: boolean;
  reason: 'ok' | 'flag_off' | 'gateway_unsupported' | 'missing_gateway';
}> {
  const flag_enabled = await isCrmPixAutomaticEnabled(opts.env ?? process.env);
  if (!flag_enabled) {
    return {
      available: false,
      flag_enabled: false,
      gateway_supports: false,
      reason: 'flag_off',
    };
  }
  const key = (opts.gatewayKey || '').trim();
  if (!key) {
    return {
      available: false,
      flag_enabled: true,
      gateway_supports: false,
      reason: 'missing_gateway',
    };
  }
  const gateway_supports = gatewaySupports(key, 'pixAutomatic');
  if (!gateway_supports) {
    return {
      available: false,
      flag_enabled: true,
      gateway_supports: false,
      reason: 'gateway_unsupported',
    };
  }
  return {
    available: true,
    flag_enabled: true,
    gateway_supports: true,
    reason: 'ok',
  };
}
