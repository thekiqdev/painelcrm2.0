import type { PublicCatalogProduct } from '@/types/products';

/**
 * URLs de mídia para exibição pública: `images` ordenado (principal = [0]);
 * `secondary_images` só entra como legado quando não duplica entrada em `images`.
 */
export function getPublicProductGalleryUrls(product: PublicCatalogProduct): string[] {
  const primary = Array.isArray(product.images)
    ? product.images.map(String).filter((u) => u.trim().length > 0)
    : [];
  const legacy = Array.isArray(product.secondary_images)
    ? product.secondary_images.map(String).filter((u) => u.trim().length > 0)
    : [];
  const seen = new Set(primary);
  const out = [...primary];
  for (const u of legacy) {
    if (!seen.has(u)) {
      out.push(u);
      seen.add(u);
    }
  }
  return out;
}

export function getPublicProductThumbnailUrl(product: PublicCatalogProduct): string | null {
  const urls = getPublicProductGalleryUrls(product);
  return urls[0] ?? null;
}
