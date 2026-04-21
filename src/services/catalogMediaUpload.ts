import { apiClient, getApiUrl } from '@/integrations/api/client';
import { normalizeBrandUrl } from '@/utils/tenantBranding';

/**
 * Ajusta a URL devolvida pelo upload para o browser:
 * - força https quando a página é https (URLs antigas gravadas como http);
 * - em produção com API no mesmo host (base relativa), usa path `/media/catalog/...`
 *   para o pedido seguir o mesmo proxy que `/api` (evita 404 se a origem absoluta estiver errada).
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

export interface CatalogUploadResponse {
  publicUrl: string;
  key: string;
}

/**
 * Envia imagem via multipart para o backend; arquivo é salvo em disco e retorna URL pública absoluta.
 */
export async function uploadCatalogImageFile(
  file: File,
  scope: CatalogMediaScope
): Promise<string> {
  const form = new FormData();
  form.append('scope', scope);
  form.append('file', file);

  const res = await apiClient.post<CatalogUploadResponse>('/api/catalog-media/upload', form);

  if (res.error || !res.data?.publicUrl) {
    throw new Error(res.error || 'Falha no upload');
  }

  return normalizeCatalogMediaUrlForBrowser(res.data.publicUrl);
}

export function isCatalogMediaUploadLikelyConfigured(): boolean {
  return import.meta.env.VITE_CATALOG_MEDIA_UPLOAD_ENABLED !== 'false';
}
