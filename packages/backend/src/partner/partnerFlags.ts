/**
 * M5 Partner — feature flags (`partner.*`).
 * Precedência: Super Admin `platform_feature_flags` → env contingência (só se flag ausente no DB).
 */

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export const PARTNER_CHANNEL_FLAG_KEY = 'partner.channel_v1' as const;
export const PARTNER_DOMAIN_VERIFY_BYPASS_FLAG_KEY = 'partner.domain_verify_bypass' as const;
export const PARTNER_MASTER_OFF_FLAG_KEY = 'partner.master_off' as const;

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

async function resolvePartnerFlag(
  key: string,
  envKeys: string[],
  ctx?: { tenantId?: string | null; userId?: string | null }
): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(key, {
      tenantId: ctx?.tenantId ?? null,
      userId: ctx?.userId ?? null,
    });
    if (res.reason !== 'unknown_flag') {
      return res.enabled;
    }
  } catch {
    /* fall through to env */
  }
  for (const envKey of envKeys) {
    const fromEnv = parseEnvBool(process.env[envKey]);
    if (fromEnv != null) return fromEnv;
  }
  return false;
}

/** Canal Partner (APIs + UI). Ligar em Super Admin → Feature Flags → partner.channel_v1. */
export async function isPartnerChannelEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  return resolvePartnerFlag(PARTNER_CHANNEL_FLAG_KEY, ['PARTNER_CHANNEL_V1'], ctx);
}

/**
 * Bypass de verificação DNS do domínio WL.
 * Ligar em Super Admin → Feature Flags → partner.domain_verify_bypass (só non-prod).
 */
export async function isPartnerDomainVerifyBypassEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  return resolvePartnerFlag(
    PARTNER_DOMAIN_VERIFY_BYPASS_FLAG_KEY,
    ['PARTNER_DOMAIN_VERIFY_BYPASS'],
    ctx
  );
}
