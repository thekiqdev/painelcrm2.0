/**
 * TD Sprint 0 — feature flags `tenant.*` (domínio personalizado loja | chamados).
 * Precedência: Super Admin `platform_feature_flags` → env contingência (só se flag ausente no DB).
 */

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export const TENANT_CUSTOM_DOMAIN_FLAG_KEY = 'tenant.custom_domain_v1' as const;
export const TENANT_DOMAIN_VERIFY_BYPASS_FLAG_KEY = 'tenant.domain_verify_bypass' as const;
export const TENANT_MASTER_OFF_FLAG_KEY = 'tenant.master_off' as const;

/** Papéis de host no MVP (Settings Domínio). */
export const TENANT_HOST_ROLES = ['store', 'support'] as const;
export type TenantHostRole = (typeof TENANT_HOST_ROLES)[number];

export function isTenantHostRole(value: unknown): value is TenantHostRole {
  return value === 'store' || value === 'support';
}

/**
 * Hosts reservados (não podem ser cadastrados como custom domain).
 * Env `TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS` (CSV) estende a lista default.
 * Sempre inclui o target CNAME e overlaps comuns com Partner.
 */
export function getTenantCustomDomainBlockedHosts(): string[] {
  const defaults = [
    'localhost',
    '127.0.0.1',
    '::1',
    'painelcrm.com',
    'www.painelcrm.com',
    'app.painelcrm.com',
  ];
  const fromEnv = (process.env.TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const cname = (process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET || process.env.PARTNER_WL_CNAME_TARGET || '')
    .trim()
    .toLowerCase();
  const set = new Set([...defaults, ...fromEnv]);
  if (cname) set.add(cname);
  return [...set];
}

/** Target CNAME documentado para o cliente apontar o subdomínio. */
export function getTenantCustomDomainCnameTarget(): string | null {
  const raw = (
    process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET ||
    process.env.PARTNER_WL_CNAME_TARGET ||
    ''
  )
    .trim()
    .toLowerCase();
  return raw || null;
}

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

async function resolveTenantFlag(
  key: string,
  envKeys: string[],
  ctx?: { tenantId?: string | null; userId?: string | null },
  /** Fallback se flag ausente no DB e sem env (custom_domain = ON por padrão). */
  defaultWhenUnknown = false
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
  return defaultWhenUnknown;
}

/** Domínio personalizado tenant (APIs + Settings). ON por padrão; Super Admin / kill switch podem desligar. */
export async function isTenantCustomDomainEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  return resolveTenantFlag(
    TENANT_CUSTOM_DOMAIN_FLAG_KEY,
    ['TENANT_CUSTOM_DOMAIN_V1'],
    ctx,
    true
  );
}

/**
 * Bypass DNS verify (dev/staging).
 * Super Admin → Feature Flags → tenant.domain_verify_bypass — nunca em produção.
 */
export async function isTenantDomainVerifyBypassEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  return resolveTenantFlag(
    TENANT_DOMAIN_VERIFY_BYPASS_FLAG_KEY,
    ['TENANT_DOMAIN_VERIFY_BYPASS'],
    ctx
  );
}
