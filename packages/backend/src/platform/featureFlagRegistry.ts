import { createHash } from 'crypto';
import {
  loadAllPlatformFeatureFlags,
  loadTenantOverridesForFlags,
  type PlatformFeatureFlagRow,
} from './featureFlagRepository.js';
import type { PlatformFeatureFlagKey } from './featureFlagKeys.js';
import { logFeatureFlag } from './platformFeatureFlagLogger.js';

export type FeatureFlagContext = {
  tenantId?: string | null;
  userId?: string | null;
  sessionId?: string;
  /** Sobrescreve NODE_ENV para testes */
  environment?: string;
};

export type FeatureFlagResolutionReason =
  | 'kill_switch'
  | 'tenant_override'
  | 'rollout_global'
  | 'rollout_percent'
  | 'rollout_internal'
  | 'rollout_allowlist'
  | 'default'
  | 'shadow_mode'
  | 'rollout_off'
  | 'unknown_flag'
  | 'env_fallback';

export type FeatureFlagResolution = {
  key: string;
  enabled: boolean;
  shadow: boolean;
  reason: FeatureFlagResolutionReason;
};

type CacheEntry = {
  definitions: Map<string, PlatformFeatureFlagRow>;
  loadedAt: number;
};

const CACHE_TTL_MS = parseInt(process.env.PLATFORM_FEATURE_FLAG_CACHE_TTL_MS || '60000', 10);

let cache: CacheEntry = {
  definitions: new Map(),
  loadedAt: 0,
};

let cacheHits = 0;
let cacheMisses = 0;

function deployEnvironment(): string {
  return (
    process.env.PLATFORM_ROLLOUT_ENV ||
    process.env.DEPLOY_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  );
}

function parseInternalTenantIds(): Set<string> {
  const raw = process.env.PLATFORM_INTERNAL_TENANT_IDS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function parseAllowlistTenantIds(flagKey: string): Set<string> {
  const envKey = `PLATFORM_FLAG_ALLOWLIST_${flagKey.replace(/\./g, '_').toUpperCase()}`;
  const raw = process.env[envKey] || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function stablePercentBucket(seed: string, flagKey: string): number {
  const hash = createHash('sha256').update(`${seed}:${flagKey}`).digest();
  return hash[0]! % 100;
}

function envFallbackEnabled(key: string): boolean | undefined {
  const envKey = `PLATFORM_FLAG_${key.replace(/\./g, '_').toUpperCase()}`;
  const v = process.env[envKey];
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

async function ensureCacheFresh(force = false): Promise<Map<string, PlatformFeatureFlagRow>> {
  const now = Date.now();
  if (!force && cache.definitions.size > 0 && now - cache.loadedAt < CACHE_TTL_MS) {
    cacheHits += 1;
    return cache.definitions;
  }
  cacheMisses += 1;
  const rows = await loadAllPlatformFeatureFlags();
  const definitions = new Map<string, PlatformFeatureFlagRow>();
  for (const row of rows) {
    definitions.set(row.key, row);
  }
  cache = { definitions, loadedAt: now };
  logFeatureFlag('cache_refreshed', {
    important: true,
    count: definitions.size,
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
  });
  return definitions;
}

function resolveKillSwitch(
  definitions: Map<string, PlatformFeatureFlagRow>,
  killKey: string | null,
  ctx: FeatureFlagContext,
  depth: number,
): boolean {
  if (!killKey || depth > 3) return false;
  const killDef = definitions.get(killKey);
  if (!killDef) {
    const env = envFallbackEnabled(killKey);
    return env === true;
  }
  const killRes = evaluateDefinition(killDef, definitions, ctx, depth + 1);
  return killRes.enabled;
}

function evaluateDefinition(
  def: PlatformFeatureFlagRow,
  definitions: Map<string, PlatformFeatureFlagRow>,
  ctx: FeatureFlagContext,
  depth: number,
): FeatureFlagResolution {
  const key = def.key;

  if (def.kill_switch_key && resolveKillSwitch(definitions, def.kill_switch_key, ctx, depth)) {
    return { key, enabled: false, shadow: false, reason: 'kill_switch' };
  }

  const env = deployEnvironment();
  if (env !== 'production' && process.env.PLATFORM_FLAGS_ENABLE_ALL_IN_NON_PROD === '1') {
    return { key, enabled: true, shadow: false, reason: 'rollout_global' };
  }

  if (def.rollout_type === 'off' && !def.default_enabled) {
    return { key, enabled: false, shadow: false, reason: 'rollout_off' };
  }

  if (def.rollout_type === 'global' || def.default_enabled) {
    return { key, enabled: true, shadow: false, reason: 'rollout_global' };
  }

  const tenantId = ctx.tenantId ?? undefined;
  if (tenantId) {
    // Overrides carregados externamente quando batch — single resolve abaixo
  }

  if (def.rollout_type === 'internal' && tenantId && parseInternalTenantIds().has(tenantId)) {
    return { key, enabled: true, shadow: false, reason: 'rollout_internal' };
  }

  if (def.rollout_type === 'allowlist' && tenantId && parseAllowlistTenantIds(key).has(tenantId)) {
    return { key, enabled: true, shadow: false, reason: 'rollout_allowlist' };
  }

  if (def.rollout_type === 'percent' && tenantId && def.rollout_percent > 0) {
    const bucket = stablePercentBucket(tenantId, key);
    if (bucket < def.rollout_percent) {
      return { key, enabled: true, shadow: false, reason: 'rollout_percent' };
    }
  }

  return {
    key,
    enabled: def.default_enabled,
    shadow: false,
    reason: 'default',
  };
}

/**
 * Registry central P0 — consultar rollout de implementação (não plan features).
 */
export const featureFlagRegistry = {
  async refresh(): Promise<void> {
    await ensureCacheFresh(true);
  },

  invalidateCache(): void {
    cache = { definitions: new Map(), loadedAt: 0 };
    logFeatureFlag('cache_invalidated', { important: true });
  },

  getCacheStats(): { hits: number; misses: number; size: number } {
    return { hits: cacheHits, misses: cacheMisses, size: cache.definitions.size };
  },

  async resolve(key: string, ctx: FeatureFlagContext = {}): Promise<FeatureFlagResolution> {
    const envFb = envFallbackEnabled(key);
    if (envFb !== undefined && cache.definitions.size === 0) {
      await ensureCacheFresh();
      if (cache.definitions.size === 0) {
        return {
          key,
          enabled: envFb,
          shadow: false,
          reason: 'env_fallback',
        };
      }
    }

    const definitions = await ensureCacheFresh();
    const def = definitions.get(key);
    if (!def) {
      if (envFb !== undefined) {
        return { key, enabled: envFb, shadow: false, reason: 'env_fallback' };
      }
      if (key === 'platform.correlation_middleware_v1') {
        return { key, enabled: true, shadow: false, reason: 'env_fallback' };
      }
      return { key, enabled: false, shadow: false, reason: 'unknown_flag' };
    }

    const tenantId = ctx.tenantId ?? undefined;
    if (tenantId) {
      const overrides = await loadTenantOverridesForFlags(tenantId, [key]);
      if (overrides.has(key)) {
        const enabled = overrides.get(key)!;
        return {
          key,
          enabled,
          shadow: def.shadow_mode && !enabled,
          reason: 'tenant_override',
        };
      }
    }

    if (def.shadow_mode) {
      return { key, enabled: false, shadow: true, reason: 'shadow_mode' };
    }

    let resolution = evaluateDefinition(def, definitions, ctx, 0);

    if (process.env.PLATFORM_FEATURE_FLAG_DEBUG === '1') {
      logFeatureFlag('resolved', {
        important: true,
        key,
        enabled: resolution.enabled,
        shadow: resolution.shadow,
        reason: resolution.reason,
        tenant_id: ctx.tenantId,
      });
    }

    return resolution;
  },

  async isEnabled(key: PlatformFeatureFlagKey | string, ctx: FeatureFlagContext = {}): Promise<boolean> {
    const res = await this.resolve(key, ctx);
    return res.enabled;
  },

  async isShadow(key: PlatformFeatureFlagKey | string, ctx: FeatureFlagContext = {}): Promise<boolean> {
    const res = await this.resolve(key, ctx);
    return res.shadow;
  },
};

export async function refreshPlatformFeatureFlagRegistry(): Promise<void> {
  await featureFlagRegistry.refresh();
}
