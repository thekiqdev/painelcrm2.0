/**
 * M5 S2 — resolve marca Partner por host / tenant.
 */

import { pool } from '../utils/db.js';
import { isPartnerChannelEnabled } from './partnerFlags.js';

export type PartnerPublicBrand = {
  partner_tenant_id: string;
  public_name: string;
  product_name: string;
  logo_url: string | null;
  theme_json: Record<string, unknown>;
  custom_domain: string | null;
  domain_status: string;
  tagline: string | null;
};

function platformFallbackName(): string {
  return (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
}

export function normalizeHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = String(raw).trim().toLowerCase();
  if (!h) return null;
  // strip scheme if pasted
  h = h.replace(/^https?:\/\//, '');
  h = h.split('/')[0] ?? h;
  h = h.split(':')[0] ?? h; // strip port
  if (h.startsWith('www.')) h = h.slice(4);
  return h || null;
}

function mapBrandRow(row: {
  partner_tenant_id: string;
  public_name: string;
  product_name: string;
  logo_url: string | null;
  theme_json: Record<string, unknown> | null;
  custom_domain: string | null;
  domain_status: string;
}): PartnerPublicBrand {
  const theme = row.theme_json && typeof row.theme_json === 'object' ? row.theme_json : {};
  const tagline =
    typeof theme.tagline === 'string' && theme.tagline.trim()
      ? theme.tagline.trim()
      : null;
  return {
    partner_tenant_id: row.partner_tenant_id,
    public_name: row.public_name,
    product_name: row.product_name,
    logo_url: row.logo_url,
    theme_json: theme,
    custom_domain: row.custom_domain,
    domain_status: row.domain_status,
    tagline,
  };
}

/**
 * Marca pública por hostname (domínio verified/active).
 * Não exige feature flag — WL precisa funcionar no login do domínio do Partner.
 */
export async function resolvePartnerBrandByHost(
  hostRaw: string | null | undefined
): Promise<PartnerPublicBrand | null> {
  const host = normalizeHostname(hostRaw);
  if (!host) return null;

  const result = await pool.query<{
    partner_tenant_id: string;
    public_name: string;
    product_name: string;
    logo_url: string | null;
    theme_json: Record<string, unknown> | null;
    custom_domain: string | null;
    domain_status: string;
  }>(
    `SELECT pp.partner_tenant_id, pp.public_name, pp.product_name, pp.logo_url,
            pp.theme_json, pp.custom_domain, pp.domain_status
     FROM partner_profiles pp
     JOIN tenants t ON t.id = pp.partner_tenant_id AND t.account_type = 'partner'
     WHERE pp.status = 'active'
       AND pp.domain_status IN ('verified', 'active')
       AND pp.custom_domain IS NOT NULL
       AND lower(pp.custom_domain) = $1
     LIMIT 1`,
    [host]
  );
  const row = result.rows[0];
  return row ? mapBrandRow(row) : null;
}

export async function resolvePartnerBrandByPartnerId(
  partnerTenantId: string
): Promise<PartnerPublicBrand | null> {
  const result = await pool.query<{
    partner_tenant_id: string;
    public_name: string;
    product_name: string;
    logo_url: string | null;
    theme_json: Record<string, unknown> | null;
    custom_domain: string | null;
    domain_status: string;
  }>(
    `SELECT partner_tenant_id, public_name, product_name, logo_url,
            theme_json, custom_domain, domain_status
     FROM partner_profiles
     WHERE partner_tenant_id = $1 AND status = 'active'
     LIMIT 1`,
    [partnerTenantId]
  );
  const row = result.rows[0];
  return row ? mapBrandRow(row) : null;
}

/**
 * Nome exibido em e-mails / WhatsApp transacional do canal.
 * Partner ou customer_tenant → product_name; senão Platform.
 */
export async function resolveTransactionalBrandName(opts: {
  tenantId?: string | null;
  host?: string | null;
}): Promise<string> {
  if (opts.host) {
    const byHost = await resolvePartnerBrandByHost(opts.host);
    if (byHost) return byHost.product_name || byHost.public_name;
  }

  const tenantId = opts.tenantId?.trim();
  if (tenantId) {
    const result = await pool.query<{
      account_type: string;
      partner_id: string | null;
    }>(`SELECT account_type, partner_id FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]);
    const t = result.rows[0];
    if (t) {
      const partnerId =
        t.account_type === 'partner'
          ? tenantId
          : t.account_type === 'customer_tenant'
            ? t.partner_id
            : null;
      if (partnerId) {
        const brand = await resolvePartnerBrandByPartnerId(partnerId);
        if (brand) return brand.product_name || brand.public_name;
      }
    }
  }

  return platformFallbackName();
}

export async function assertPartnerChannelOrPublicBrand(): Promise<boolean> {
  // Public brand resolution does not require flag; used for documentation/tests.
  return isPartnerChannelEnabled({});
}

export { platformFallbackName };
