import {
  isCatalogMediaKeyOwnedByTenantUser,
  unlinkCatalogMediaRelativeKey,
} from './catalogMediaUploadService.js';
import { extractCatalogMediaRelativeKeyFromStoredUrl } from '../utils/catalogMediaPublicSignedUrl.js';
import { deleteFile } from './media/mediaLocalStorageAdapter.js';
import {
  isMediaSimpleUploadOwnedBy,
  parseMediaServiceSimpleStorageKey,
} from './media/simpleUploadMediaService.js';
import { extractMediaStorageKeyFromStoredUrl } from './media/mediaUrlSigner.js';

function asUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim());
}

/**
 * Remove do disco as imagens do catálogo referenciadas nas URLs do produto.
 * URLs externas (ex.: WooCommerce) são ignoradas. Falhas de unlink não propagam.
 */
export async function unlinkStoredProductImageUrls(params: {
  images: unknown;
  secondaryImages?: unknown;
  tenantId: string | null;
  /** Dono das chaves (products.user_id). */
  ownerUserId: string;
}): Promise<{ attempted: number; removed: number }> {
  const urls = [...asUrlList(params.images), ...asUrlList(params.secondaryImages)];
  const catalogKeys = new Set<string>();
  const mediaKeys = new Set<string>();
  const tenantSegment = params.tenantId || 'no-tenant';

  for (const url of urls) {
    const catalogKey = extractCatalogMediaRelativeKeyFromStoredUrl(url);
    if (
      catalogKey &&
      isCatalogMediaKeyOwnedByTenantUser(catalogKey, params.tenantId, params.ownerUserId)
    ) {
      catalogKeys.add(catalogKey);
      continue;
    }

    const mediaKey = extractMediaStorageKeyFromStoredUrl(url);
    if (!mediaKey) continue;

    if (mediaKey.includes('/users/')) {
      if (isCatalogMediaKeyOwnedByTenantUser(mediaKey, params.tenantId, params.ownerUserId)) {
        catalogKeys.add(mediaKey);
      }
      continue;
    }

    const parsed = parseMediaServiceSimpleStorageKey(mediaKey);
    if (
      parsed &&
      isMediaSimpleUploadOwnedBy(mediaKey, {
        tenantSegment,
        tenantUuid: params.tenantId,
        userId: params.ownerUserId,
      })
    ) {
      mediaKeys.add(mediaKey);
    }
  }

  let removed = 0;
  const attempted = catalogKeys.size + mediaKeys.size;

  for (const key of catalogKeys) {
    try {
      await unlinkCatalogMediaRelativeKey(key);
      removed += 1;
    } catch (e) {
      console.warn('[productMediaCleanup] falha ao remover catalog-media', {
        key,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (const key of mediaKeys) {
    try {
      await deleteFile(key);
      removed += 1;
    } catch (e) {
      console.warn('[productMediaCleanup] falha ao remover media key', {
        key,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { attempted, removed };
}
