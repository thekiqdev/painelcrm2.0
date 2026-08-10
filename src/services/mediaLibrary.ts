import { apiClient, getApiUrl } from '@/integrations/api/client';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';

export type MediaLibraryQuota = {
  usedCount: number;
  usedBytes: number;
  maxCount: number;
  maxTotalBytes: number;
  remainingCount: number;
  remainingBytes: number;
};

export type MediaLibraryAsset = {
  id: string;
  tenantId: string;
  scope: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  originalFilename: string | null;
  status: string;
  relativeUrl: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaLibraryListResponse = {
  ok: boolean;
  items: MediaLibraryAsset[];
  total: number;
  quota: MediaLibraryQuota;
};

function mediaUrlForBrowser(relativeUrl: string): string {
  return normalizeCatalogMediaUrlForBrowser(relativeUrl);
}

export function resolveMediaLibraryPreviewUrl(asset: MediaLibraryAsset): string {
  return mediaUrlForBrowser(asset.relativeUrl);
}

export async function listMediaLibrary(params?: {
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<MediaLibraryListResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  if (params?.q) sp.set('q', params.q);
  const qs = sp.toString();
  const res = await apiClient.get<MediaLibraryListResponse>(
    `/api/media/v1/library${qs ? `?${qs}` : ''}`,
  );
  if (res.error || !res.data?.ok) {
    throw new Error(
      res.error || (res.data as { error?: string } | undefined)?.error || 'Erro ao listar mídias.',
    );
  }
  return res.data;
}

export async function uploadMediaLibraryFile(file: File): Promise<MediaLibraryAsset> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<{ ok: boolean; asset: MediaLibraryAsset; error?: string }>(
    '/api/media/v1/library/upload',
    form,
  );
  if (res.error || !res.data?.ok || !res.data.asset) {
    throw new Error(res.error || res.data?.error || 'Erro no upload.');
  }
  return res.data.asset;
}

export async function deleteMediaLibraryAsset(id: string): Promise<void> {
  const res = await apiClient.delete<{ ok: boolean; error?: string }>(`/api/media/v1/library/${id}`);
  if (res.error || !res.data?.ok) {
    throw new Error(res.error || res.data?.error || 'Erro ao apagar mídia.');
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Hint de base da API (debug). */
export function getMediaLibraryApiHint(): string {
  return getApiUrl() || '(same origin)';
}
