import { apiClient, getApiUrl } from '@/integrations/api/client';
import { normalizeBrandUrl } from '@/utils/tenantBranding';

/**
 * Ajusta a URL devolvida pelo upload para o browser:
 * - força https quando a página é https (URLs antigas gravadas como http);
 * - em produção com API no mesmo host (base relativa), usa path relativo completo (incl. query) para
 *   `/api/public/catalog-media/raw?...` (assinado no backend; path sem .png para contornar nginx estático).
 */
export function normalizeCatalogMediaUrlForBrowser(publicUrl: string): string {
  const fixed = normalizeBrandUrl(publicUrl.trim());
  if (!fixed || typeof window === 'undefined') return fixed;
  try {
    const apiBase = getApiUrl();
    if (apiBase !== '') return fixed;
    const u = new URL(fixed, window.location.origin);
    if (u.origin === window.location.origin) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return fixed;
}

export type CatalogMediaScope =
  | 'product'
  | 'store_logo'
  | 'store_banner'
  | 'tenant_logo_light'
  | 'tenant_logo_dark';

const RAW_PATH = '/api/public/catalog-media/raw';
const LEGACY_MEDIA = '/media/catalog/';
const LEGACY_API_PUBLIC = '/api/catalog-media/public/';

/** base64url decode (UTF-8) — compatível com chaves de path em português */
function base64UrlToUtf8(k: string): string | null {
  try {
    let b64 = k.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Extrai a chave relativa (tenants/.../ficheiro) da URL guardada ou assinada (alinhado ao backend). */
export function extractCatalogMediaRelativeKeyFromUrl(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const t = stored.trim();
  if (!t) return null;
  if (t.startsWith('tenants/')) return t;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid';
    const u = new URL(t, base);
    const p = u.pathname;
    if (p.startsWith(LEGACY_MEDIA)) {
      return p
        .slice(LEGACY_MEDIA.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
    }
    if (p.startsWith(LEGACY_API_PUBLIC)) {
      return p
        .slice(LEGACY_API_PUBLIC.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
    }
    if (p.includes(RAW_PATH)) {
      const k = u.searchParams.get('k');
      if (!k) return null;
      return base64UrlToUtf8(k);
    }
  } catch {
    return null;
  }
  return null;
}

export interface CatalogUploadResponse {
  publicUrl: string;
  key: string;
}

export async function deleteCatalogMediaFileByKey(key: string): Promise<void> {
  const res = await apiClient.post<{ ok: boolean }>('/api/catalog-media/delete', { key });
  if (res.error) throw new Error(res.error);
}

/**
 * Envia imagem via multipart para o backend; arquivo é salvo em disco e retorna URL pública absoluta.
 * Se `previousUrl` for passada, o ficheiro antigo é removido no servidor após o novo upload (mesmo scope).
 */
export async function uploadCatalogImageFile(
  file: File,
  scope: CatalogMediaScope,
  options?: { previousUrl?: string | null },
): Promise<string> {
  const form = new FormData();
  form.append('scope', scope);
  form.append('file', file);
  const prevKey = options?.previousUrl ? extractCatalogMediaRelativeKeyFromUrl(options.previousUrl) : null;
  if (prevKey) form.append('previous_key', prevKey);

  const res = await apiClient.post<CatalogUploadResponse>('/api/catalog-media/upload', form);

  if (res.error || !res.data?.publicUrl) {
    throw new Error(res.error || 'Falha no upload');
  }

  return normalizeCatalogMediaUrlForBrowser(res.data.publicUrl);
}

export function isCatalogMediaUploadLikelyConfigured(): boolean {
  return import.meta.env.VITE_CATALOG_MEDIA_UPLOAD_ENABLED !== 'false';
}
