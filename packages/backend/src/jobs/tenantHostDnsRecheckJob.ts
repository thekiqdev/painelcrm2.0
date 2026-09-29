/**
 * TD Sprint 5 — recheck periódico de DNS em tenant_hosts active.
 * Ligar com TENANT_CUSTOM_DOMAIN_DNS_RECHECK=1 (default off).
 */
import { recheckActiveTenantHosts } from '../tenantCustomDomain/tenantDomainService.js';
import { logTenantDomain } from '../tenantCustomDomain/tenantDomainLogger.js';

export function isTenantHostDnsRecheckEnabled(): boolean {
  const v = (process.env.TENANT_CUSTOM_DOMAIN_DNS_RECHECK || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Default 6h. */
export function getTenantHostDnsRecheckIntervalMs(): number {
  const raw = parseInt(process.env.TENANT_HOST_DNS_RECHECK_POLL_MS || '', 10);
  if (Number.isFinite(raw) && raw >= 60_000) return raw;
  return 6 * 60 * 60 * 1000;
}

export async function runTenantHostDnsRecheckOnce(): Promise<void> {
  if (!isTenantHostDnsRecheckEnabled()) return;
  const result = await recheckActiveTenantHosts({ limit: 50 });
  if (result.checked > 0 || result.demoted > 0) {
    logTenantDomain('dns_recheck', result);
  }
}
