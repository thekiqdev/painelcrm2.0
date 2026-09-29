export {
  TENANT_CUSTOM_DOMAIN_FLAG_KEY,
  TENANT_DOMAIN_VERIFY_BYPASS_FLAG_KEY,
  TENANT_MASTER_OFF_FLAG_KEY,
  TENANT_CUSTOM_DOMAIN_CNAME_FALLBACK,
  TENANT_HOST_ROLES,
  isTenantHostRole,
  getTenantCustomDomainBlockedHosts,
  getTenantCustomDomainCnameTarget,
  hostnameFromPlatformPublicBase,
  isTenantCustomDomainEnabled,
  isTenantDomainVerifyBypassEnabled,
  type TenantHostRole,
} from './tenantDomainFlags.js';
export { TenantDomainError } from './tenantDomainErrors.js';
export {
  setTenantDomain,
  verifyTenantDomain,
  clearTenantDomain,
  changeTenantHostRole,
  getTenantDomainInstructions,
  listTenantHosts,
  getTenantHostByRole,
  listTenantHostsForAdmin,
  clearTenantDomainAsAdmin,
  recheckActiveTenantHosts,
} from './tenantDomainService.js';
export type { TenantHostDnsRecheckResult } from './tenantDomainService.js';
export { logTenantDomain } from './tenantDomainLogger.js';
export {
  buildCanonicalStoreUrl,
  buildCanonicalSupportPortalUrl,
  resolveTenantPublicOrigin,
} from './tenantPublicUrls.js';
export {
  getMyTenantDomain,
  postMyTenantDomain,
  postMyTenantDomainVerify,
  postMyTenantDomainChangeRole,
  deleteMyTenantDomain,
  superadminGetTenantDomain,
  superadminClearTenantDomain,
} from './tenantDomainControllers.js';
export { resolveTenantHostByHostname } from './tenantHostResolver.js';
export type { ResolvedTenantHost } from './tenantHostResolver.js';
export { publicGetTenantHost } from './tenantHostPublicController.js';
