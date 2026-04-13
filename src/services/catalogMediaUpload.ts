import { apiClient } from '@/integrations/api/client';

export type CatalogMediaScope = 'product' | 'store_logo' | 'store_banner';

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

  return res.data.publicUrl;
}

export function isCatalogMediaUploadLikelyConfigured(): boolean {
  return import.meta.env.VITE_CATALOG_MEDIA_UPLOAD_ENABLED !== 'false';
}
