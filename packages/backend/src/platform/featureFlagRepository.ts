import { pool } from '../utils/db.js';

export type PlatformFeatureFlagRow = {
  key: string;
  namespace: string;
  description: string;
  default_enabled: boolean;
  kill_switch_key: string | null;
  rollout_type: 'off' | 'internal' | 'allowlist' | 'percent' | 'global';
  rollout_percent: number;
  shadow_mode: boolean;
  schema_version: number;
  updated_at?: string;
};

export type TenantOverrideRow = {
  flag_key: string;
  tenant_id: string;
  enabled: boolean;
  expires_at: Date | null;
};

let missingTableWarned = false;

function isMissingTableError(msg: string): boolean {
  return (
    msg.includes('42P01') ||
    /relation\s+["']?platform_feature_flags["']?\s+does not exist/i.test(msg)
  );
}

export async function loadAllPlatformFeatureFlags(): Promise<PlatformFeatureFlagRow[]> {
  try {
    const r = await pool.query<PlatformFeatureFlagRow>(
      `SELECT key, namespace, description, default_enabled, kill_switch_key,
              rollout_type, rollout_percent, shadow_mode, schema_version, updated_at
       FROM platform_feature_flags
       ORDER BY namespace, key`,
    );
    return r.rows;
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (isMissingTableError(msg)) {
      if (!missingTableWarned) {
        console.warn('[FEATURE_FLAG] platform_feature_flags ausente; registry em modo fallback.');
        missingTableWarned = true;
      }
      return [];
    }
    throw e;
  }
}

export async function loadTenantOverridesForFlags(
  tenantId: string,
  flagKeys: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!tenantId || flagKeys.length === 0) return result;
  try {
    const r = await pool.query<TenantOverrideRow>(
      `SELECT flag_key, tenant_id, enabled, expires_at
       FROM platform_feature_flag_overrides
       WHERE tenant_id = $1
         AND flag_key = ANY($2::text[])
         AND (expires_at IS NULL OR expires_at > now())`,
      [tenantId, flagKeys],
    );
    for (const row of r.rows) {
      result.set(row.flag_key, row.enabled);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (isMissingTableError(msg)) return result;
    throw e;
  }
  return result;
}

export async function listPlatformFeatureFlagsForAdmin(): Promise<PlatformFeatureFlagRow[]> {
  return loadAllPlatformFeatureFlags();
}

export type PlatformFeatureFlagAdminPatch = Partial<
  Pick<PlatformFeatureFlagRow, 'default_enabled' | 'shadow_mode' | 'rollout_percent'>
>;

export async function findPlatformFeatureFlagByKey(key: string): Promise<PlatformFeatureFlagRow | null> {
  const r = await pool.query<PlatformFeatureFlagRow>(
    `SELECT key, namespace, description, default_enabled, kill_switch_key,
            rollout_type, rollout_percent, shadow_mode, schema_version, updated_at
     FROM platform_feature_flags
     WHERE key = $1`,
    [key],
  );
  return r.rows[0] ?? null;
}

export async function patchPlatformFeatureFlagForAdmin(
  key: string,
  patch: PlatformFeatureFlagAdminPatch,
): Promise<PlatformFeatureFlagRow | null> {
  const allowed: (keyof PlatformFeatureFlagAdminPatch)[] = ['default_enabled', 'shadow_mode', 'rollout_percent'];
  const entries = allowed
    .map((k) => [k, patch[k]] as const)
    .filter(([, v]) => v !== undefined);

  if (entries.length === 0) {
    return findPlatformFeatureFlagByKey(key);
  }

  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const [k, v] of entries) {
    sets.push(`${String(k)} = $${i++}`);
    params.push(v);
  }
  params.push(key);

  const r = await pool.query<PlatformFeatureFlagRow>(
    `UPDATE platform_feature_flags
        SET ${sets.join(', ')},
            updated_at = now()
      WHERE key = $${i}
      RETURNING key, namespace, description, default_enabled, kill_switch_key,
                rollout_type, rollout_percent, shadow_mode, schema_version, updated_at`,
    params,
  );
  return r.rows[0] ?? null;
}
