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
const MEDIA_RAW_PATH = '/api/media/v1/raw';
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
  /** Layout catalog: `tenants/.../users/...`; paths MediaService não têm `users/`. */
  if (t.startsWith('tenants/')) {
    if (!t.includes('/users/')) return null;
    return t;
  }
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

/** Catalog (`/api/public/catalog-media/raw`) ou MediaService (`/api/media/v1/raw`) — para delete/replace. */
export function extractCatalogOrMediaStorageKeyFromUrl(stored: string | null | undefined): string | null {
  return extractCatalogMediaRelativeKeyFromUrl(stored) ?? extractMediaStorageKeyFromUrl(stored);
}

/** Chave relativa MediaService (`tenants/...` sem segmento `users/`) a partir da URL assinada ou da própria chave. */
export function extractMediaStorageKeyFromUrl(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const t = stored.trim();
  if (!t) return null;
  if (t.startsWith('tenants/') && !t.includes('/users/')) {
    const parts = t.split('/').filter(Boolean);
    if (parts.length >= 6 && parts[0] === 'tenants') return t;
    return null;
  }
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid';
    const u = new URL(t, base);
    if (u.pathname.includes(MEDIA_RAW_PATH)) {
      const k = u.searchParams.get('k');
      if (!k) return null;
      return base64UrlToUtf8(k);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export interface CatalogUploadResponse {
  publicUrl: string;
  key: string;
}

/** Abaixo disto o corpo multipart costuma passar no nginx default (~1m) no EasyPanel. */
const CATALOG_UPLOAD_SAFE_BYTES = 700 * 1024;

function baseNameWithoutExt(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'image';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(0, i) : base;
}

async function encodeCanvasUnderTarget(
  canvas: HTMLCanvasElement,
  targetMax: number,
): Promise<Blob | null> {
  const qualities = [0.86, 0.78, 0.68, 0.58, 0.5, 0.42, 0.36];
  let best: Blob | null = null;
  for (const q of qualities) {
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', q),
    );
    if (webp && (!best || webp.size < best.size)) best = webp;
    if (best && best.size <= targetMax) return best;
  }
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
  );
  if (jpeg && (!best || jpeg.size < best.size)) best = jpeg;
  return best;
}

/**
 * Reduz peso da imagem antes do POST (contorna 413 do proxy quando não há `client_max_body_size`).
 * Preserva GIF (animação). HEIC/erros de decode: devolve o ficheiro original.
 */
async function shrinkImageFileForCatalogUpload(file: File, scope: CatalogMediaScope): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }
  if (file.size <= CATALOG_UPLOAD_SAFE_BYTES) {
    return file;
  }

  const initialMaxEdge =
    scope === 'product' ? 1800 : scope === 'store_banner' ? 1600 : 1200;
  const targetMax = CATALOG_UPLOAD_SAFE_BYTES;

  let maxEdge = initialMaxEdge;
  for (let pass = 0; pass < 7; pass++) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }

    try {
      let w = bitmap.width;
      let h = bitmap.height;
      const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close?.();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();

      const best = await encodeCanvasUnderTarget(canvas, targetMax);
      if (!best) {
        maxEdge = Math.max(480, Math.floor(maxEdge * 0.72));
        continue;
      }

      const improved = best.size < file.size;
      const underProxy = best.size <= targetMax * 1.05;
      if (underProxy || pass >= 6) {
        if (!improved && !underProxy) return file;
        const ext =
          best.type === 'image/png' ? 'png' : best.type === 'image/webp' ? 'webp' : 'jpg';
        const outName = `${baseNameWithoutExt(file.name)}.${ext}`;
        return new File([best], outName, {
          type: best.type || 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      maxEdge = Math.max(480, Math.floor(maxEdge * 0.72));
    } catch {
      try {
        bitmap.close?.();
      } catch {
        /* ignore */
      }
      return file;
    }
  }

  return file;
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
  const toSend = await shrinkImageFileForCatalogUpload(file, scope);
  const form = new FormData();
  form.append('scope', scope);
  form.append('file', toSend);
  const prevKey =
    options?.previousUrl &&
    (extractCatalogMediaRelativeKeyFromUrl(options.previousUrl) ??
      extractMediaStorageKeyFromUrl(options.previousUrl));
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
