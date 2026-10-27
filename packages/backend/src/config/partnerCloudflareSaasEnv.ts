/**
 * PE Etapa 2/3 — env Cloudflare for SaaS (canal Partner).
 * Etapa 2: ops manual + PARTNER_WL_CNAME_TARGET.
 * Etapa 3: API Custom Hostnames usa zone + token.
 *
 * @see docs/architecture/commercial/RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md
 */

export function getPartnerWlCnameTarget(): string | null {
  const raw = (process.env.PARTNER_WL_CNAME_TARGET || '').trim().toLowerCase();
  return raw || null;
}

export function getCloudflareSaasZoneId(): string | null {
  const raw = (process.env.CF_SAAS_ZONE_ID || '').trim();
  return raw || null;
}

/** Token — nunca logar o valor. */
export function getCloudflareSaasApiToken(): string | null {
  const raw = (process.env.CF_SAAS_API_TOKEN || '').trim();
  return raw || null;
}

export function isCloudflareSaasApiConfigured(): boolean {
  return Boolean(getCloudflareSaasZoneId() && getCloudflareSaasApiToken());
}
