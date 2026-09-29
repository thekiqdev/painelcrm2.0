import {
  listMyTenantDomains,
  type TenantDomainInstructions,
} from '@/services/tenantDomain';

let cache: { at: number; items: TenantDomainInstructions[] } | null = null;
const TTL_MS = 30_000;

async function loadDomainItems(): Promise<TenantDomainInstructions[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.items;
  const res = await listMyTenantDomains();
  if (res.error || !res.data?.items) {
    cache = { at: now, items: [] };
    return [];
  }
  cache = { at: now, items: res.data.items };
  return res.data.items;
}

export function invalidateTenantCanonicalUrlCache(): void {
  cache = null;
}

/** URL pública da loja: host store active → https://host; senão origin/{slug}/loja. */
export async function resolveCanonicalStoreUrl(
  storeSlug: string | null | undefined
): Promise<string | null> {
  const slug = (storeSlug ?? '').trim();
  if (!slug) return null;
  try {
    const items = await loadDomainItems();
    const store = items.find((i) => i.role === 'store' && i.status === 'active');
    if (store?.canonical_public_url) return store.canonical_public_url;
    if (store?.hostname) return `https://${store.hostname}`;
  } catch {
    /* fallback path */
  }
  if (typeof window === 'undefined') return `/${slug}/loja`;
  return `${window.location.origin}/${slug}/loja`;
}

/** Prefer absolute public_url from API; else origin + path. */
export function displayPublicUrl(publicUrl: string | null | undefined, pathFallback?: string | null): string | null {
  const u = (publicUrl ?? '').trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const path = (u || pathFallback || '').trim();
  if (!path) return null;
  if (typeof window === 'undefined') return path;
  if (path.startsWith('/')) return `${window.location.origin}${path}`;
  return `${window.location.origin}/${path}`;
}
