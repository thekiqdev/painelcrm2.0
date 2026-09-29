/**
 * TD Sprint 2 — resolve tenant_hosts active por hostname → contexto loja | suporte.
 */

import { pool } from '../utils/db.js';
import { normalizeHostname } from '../partner/partnerBrandResolver.js';
import type { TenantHostRole } from './tenantDomainFlags.js';

export type ResolvedTenantHost = {
  host_id: string;
  tenant_id: string;
  hostname: string;
  role: TenantHostRole;
  status: string;
  tenant_name: string;
  tenant_slug: string | null;
  logo_url: string | null;
  logo_light_url: string | null;
  /** Slug da vitrine (store_profiles) — só role=store */
  store_slug: string | null;
  /** Slug do portal público (= tenants.slug) — só role=support */
  support_portal_slug: string | null;
  support_portal_enabled: boolean;
};

async function resolveStoreSlugForTenant(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ store_slug: string | null }>(
    `SELECT sp.store_slug
     FROM store_profiles sp
     JOIN users u ON u.id = sp.user_id
     WHERE u.tenant_id = $1
       AND sp.is_active = true
       AND sp.store_slug IS NOT NULL
       AND length(trim(sp.store_slug)) > 0
     ORDER BY sp.updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  const slug = r.rows[0]?.store_slug?.trim();
  return slug || null;
}

async function resolveSupportPortal(
  tenantId: string,
  tenantSlug: string | null
): Promise<{ slug: string | null; enabled: boolean }> {
  const r = await pool.query<{ enabled: boolean | null }>(
    `SELECT enabled FROM tenant_support_portal_settings WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const enabled = Boolean(r.rows[0]?.enabled);
  const slug = tenantSlug?.trim().toLowerCase() || null;
  return { slug, enabled };
}

/**
 * Resolve host customizado do tenant (status verified|active).
 * Não compete com Partner aqui — o caller decide a ordem.
 */
export async function resolveTenantHostByHostname(
  hostRaw: string | null | undefined
): Promise<ResolvedTenantHost | null> {
  const hostname = normalizeHostname(hostRaw);
  if (!hostname) return null;

  const r = await pool.query<{
    host_id: string;
    tenant_id: string;
    hostname: string;
    role: string;
    status: string;
    tenant_name: string;
    tenant_slug: string | null;
    logo_url: string | null;
    logo_light_url: string | null;
    account_type: string | null;
  }>(
    `SELECT th.id::text AS host_id,
            th.tenant_id::text,
            th.hostname,
            th.role,
            th.status,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            t.logo_url,
            t.logo_light_url,
            t.account_type
     FROM tenant_hosts th
     JOIN tenants t ON t.id = th.tenant_id
     WHERE lower(th.hostname) = $1
       AND th.status IN ('verified', 'active')
       AND COALESCE(t.account_type, '') = 'platform_customer'
     LIMIT 1`,
    [hostname]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.role !== 'store' && row.role !== 'support') return null;

  let store_slug: string | null = null;
  let support_portal_slug: string | null = null;
  let support_portal_enabled = false;

  if (row.role === 'store') {
    store_slug = await resolveStoreSlugForTenant(row.tenant_id);
  } else {
    const portal = await resolveSupportPortal(row.tenant_id, row.tenant_slug);
    support_portal_slug = portal.slug;
    support_portal_enabled = portal.enabled;
  }

  return {
    host_id: row.host_id,
    tenant_id: row.tenant_id,
    hostname: row.hostname,
    role: row.role,
    status: row.status,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    logo_url: row.logo_light_url || row.logo_url,
    logo_light_url: row.logo_light_url,
    store_slug,
    support_portal_slug,
    support_portal_enabled,
  };
}
