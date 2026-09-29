/**
 * TD Sprint 4 — URLs canônicas públicas do tenant (loja | portal de chamados).
 * Preferem host `active` do papel; senão path na base da plataforma.
 */

import { getTenantHostByRole } from './tenantDomainService.js';
import type { TenantHostRole } from './tenantDomainFlags.js';
import { resolvePlatformPublicAppBaseUrl } from '../utils/platformPublicUrls.js';

function joinUrlPath(base: string, pathSegment: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = pathSegment.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

function httpsOriginFromHostname(hostname: string): string {
  const h = hostname.trim().toLowerCase().replace(/\/+$/, '');
  const isLocal =
    h === 'localhost' ||
    h.startsWith('localhost:') ||
    h === '127.0.0.1' ||
    h.startsWith('127.0.0.1:');
  return `${isLocal ? 'http' : 'https'}://${h}`;
}

export type CanonicalPublicUrlResult = {
  url: string;
  onCustomDomain: boolean;
  hostname: string | null;
  role: TenantHostRole;
};

/**
 * Origin pública para um papel: host active → https://hostname; senão base da platform.
 */
export async function resolveTenantPublicOrigin(
  tenantId: string,
  role: TenantHostRole,
  opts?: { originHint?: string | null }
): Promise<CanonicalPublicUrlResult> {
  const host = await getTenantHostByRole(tenantId, role);
  if (host && host.status === 'active' && host.hostname) {
    return {
      url: httpsOriginFromHostname(host.hostname),
      onCustomDomain: true,
      hostname: host.hostname,
      role,
    };
  }

  const { resolveSaleLinkOrigin } = await import('../utils/platformPublicUrls.js');
  const base = resolveSaleLinkOrigin({ originHint: opts?.originHint ?? null });
  return {
    url: base.replace(/\/+$/, ''),
    onCustomDomain: false,
    hostname: null,
    role,
  };
}

/** URL canônica da vitrine (raiz no host customizado; senão /{slug}/loja). */
export async function buildCanonicalStoreUrl(opts: {
  tenantId: string;
  storeSlug: string | null | undefined;
  originHint?: string | null;
  /** Path relativo no host customizado (ex. produto). Default: raiz. */
  pathSuffix?: string;
}): Promise<CanonicalPublicUrlResult> {
  const slug = (opts.storeSlug ?? '').trim();
  const origin = await resolveTenantPublicOrigin(opts.tenantId, 'store', {
    originHint: opts.originHint,
  });

  if (origin.onCustomDomain) {
    const suffix = (opts.pathSuffix ?? '').trim();
    if (!suffix || suffix === '/') {
      return { ...origin, url: origin.url };
    }
    const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
    // Em host customizado paths são /loja/... (sem slug)
    const normalized = path.startsWith('/loja') ? path : `/loja${path}`;
    return { ...origin, url: `${origin.url}${normalized}` };
  }

  if (!slug) {
    return { ...origin, url: origin.url };
  }
  const basePath = `/${slug}/loja`;
  const suffix = (opts.pathSuffix ?? '').trim();
  if (!suffix || suffix === '/') {
    return { ...origin, url: joinUrlPath(origin.url, basePath.replace(/^\//, '')) };
  }
  const extra = suffix.replace(/^\//, '');
  return {
    ...origin,
    url: joinUrlPath(origin.url, `${slug}/loja/${extra}`),
  };
}

/** URL canônica do portal de abertura de chamados. */
export async function buildCanonicalSupportPortalUrl(opts: {
  tenantId: string;
  portalSlug: string | null | undefined;
  originHint?: string | null;
}): Promise<CanonicalPublicUrlResult> {
  const slug = (opts.portalSlug ?? '').trim().toLowerCase();
  const origin = await resolveTenantPublicOrigin(opts.tenantId, 'support', {
    originHint: opts.originHint,
  });

  if (origin.onCustomDomain) {
    return { ...origin, url: origin.url };
  }

  if (!slug) {
    return { ...origin, url: origin.url };
  }
  return {
    ...origin,
    url: joinUrlPath(origin.url, `suporte/${slug}`),
  };
}

/** Path legado (sempre relativo) — útil para docs / fallback UI. */
export function legacyStorePath(storeSlug: string): string {
  return `/${storeSlug.trim()}/loja`;
}

export function legacySupportPortalPath(portalSlug: string): string {
  return `/suporte/${portalSlug.trim().toLowerCase()}`;
}

export function platformBaseUrl(): string {
  return resolvePlatformPublicAppBaseUrl();
}
