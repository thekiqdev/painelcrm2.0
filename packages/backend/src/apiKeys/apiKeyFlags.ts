/**
 * API do tenant — feature flag `api.keys_v1`.
 * Precedência: Super Admin `platform_feature_flags` (seed global, ligada para todos) → env `API_KEYS_V1` só se a linha não existir no DB → off.
 */

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export const API_KEYS_FLAG_KEY = 'api.keys_v1' as const;

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

export async function isApiKeysEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(API_KEYS_FLAG_KEY, {
      tenantId: ctx?.tenantId ?? null,
      userId: ctx?.userId ?? null,
    });
    if (res.reason !== 'unknown_flag') {
      return res.enabled;
    }
  } catch {
    /* env abaixo */
  }
  const fromEnv = parseEnvBool(process.env.API_KEYS_V1);
  if (fromEnv != null) return fromEnv;
  return false;
}
