/**
 * TD — feature flags `tenant.*` (domínio personalizado loja | chamados).
 * Produto ON por padrão: não exige env dedicada para ativar nem para CNAME target.
 * Precedência kill: `tenant.master_off` ou `TENANT_CUSTOM_DOMAIN_V1=false`.
 */

import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { resolvePlatformPublicAppBaseUrl } from '../utils/platformPublicUrls.js';

export const TENANT_CUSTOM_DOMAIN_FLAG_KEY = 'tenant.custom_domain_v1' as const;
export const TENANT_DOMAIN_VERIFY_BYPASS_FLAG_KEY = 'tenant.domain_verify_bypass' as const;
export const TENANT_MASTER_OFF_FLAG_KEY = 'tenant.master_off' as const;

/** Host padrão de produção quando PUBLIC_APP_URL / FRONTEND_URL não resolvem. */
export const TENANT_CUSTOM_DOMAIN_CNAME_FALLBACK = 'painelcrm.com' as const;

/** Papéis de host no MVP (Settings Domínio). */
export const TENANT_HOST_ROLES = ['store', 'support'] as const;
export type TenantHostRole = (typeof TENANT_HOST_ROLES)[number];

export function isTenantHostRole(value: unknown): value is TenantHostRole {
  return value === 'store' || value === 'support';
}

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

/** Hostname a partir de URL pública da plataforma (ignora localhost). */
export function hostnameFromPlatformPublicBase(): string | null {
  try {
    const base = resolvePlatformPublicAppBaseUrl();
    const u = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
    const h = u.hostname.trim().toLowerCase();
    if (!h) return null;
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h.endsWith('.localhost')
    ) {
      return null;
    }
    return h;
  } catch {
    return null;
  }
}

/**
 * Target CNAME para o cliente apontar o subdomínio.
 * Ordem: TENANT_CUSTOM_DOMAIN_CNAME_TARGET → PARTNER_WL_CNAME_TARGET →
 * host de PUBLIC_APP_URL/FRONTEND_URL → painelcrm.com.
 * Sempre retorna string (nunca null) para a UI sempre exibir instrução CNAME.
 */
export function getTenantCustomDomainCnameTarget(): string {
  const fromEnv = (
    process.env.TENANT_CUSTOM_DOMAIN_CNAME_TARGET ||
    process.env.PARTNER_WL_CNAME_TARGET ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (fromEnv) return fromEnv;

  return hostnameFromPlatformPublicBase() || TENANT_CUSTOM_DOMAIN_CNAME_FALLBACK;
}

/**
 * Hosts reservados (não podem ser cadastrados como custom domain).
 * Env `TENANT_CUSTOM_DOMAIN_BLOCKED_HOSTS` (CSV) estende a lista default.
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
  const cname = getTenantCustomDomainCnameTarget();
  return [...new Set([...defaults, ...fromEnv, cname])];
}

async function isTenantMasterOff(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(TENANT_MASTER_OFF_FLAG_KEY, {
      tenantId: ctx?.tenantId ?? null,
      userId: ctx?.userId ?? null,
    });
    return res.reason !== 'unknown_flag' && res.enabled;
  } catch {
    return false;
  }
}

/**
 * Domínio personalizado: ON por padrão para todos.
 * Desliga só com kill switch `tenant.master_off` ou `TENANT_CUSTOM_DOMAIN_V1=false`.
 * Flag SA `tenant.custom_domain_v1` permanece no registry (métricas/auditoria), mas não bloqueia o produto.
 */
export async function isTenantCustomDomainEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  const env = parseEnvBool(process.env.TENANT_CUSTOM_DOMAIN_V1);
  if (env === false) return false;
  if (await isTenantMasterOff(ctx)) return false;
  return true;
}

/**
 * Bypass DNS verify (dev/staging).
 * Super Admin → Feature Flags → tenant.domain_verify_bypass — nunca em produção.
 */
export async function isTenantDomainVerifyBypassEnabled(ctx?: {
  tenantId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  if (await isTenantMasterOff(ctx)) return false;
  try {
    const res = await featureFlagRegistry.resolve(TENANT_DOMAIN_VERIFY_BYPASS_FLAG_KEY, {
      tenantId: ctx?.tenantId ?? null,
      userId: ctx?.userId ?? null,
    });
    if (res.reason !== 'unknown_flag') {
      return res.enabled;
    }
  } catch {
    /* fall through */
  }
  const fromEnv = parseEnvBool(process.env.TENANT_DOMAIN_VERIFY_BYPASS);
  return fromEnv === true;
}
