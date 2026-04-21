/** Servido pelo Express no mesmo host que /api (nginx do SPA costuma não proxy de /media/catalog). */
export const CATALOG_MEDIA_PUBLIC_PATH_PREFIX = '/api/catalog-media/public/';

const LEGACY_PATH_PREFIX = '/media/catalog/';

/** Reescreve URLs antigas gravadas com /media/catalog/ para o prefixo servido via /api. */
export function rewriteLegacyCatalogMediaPath(href: string): string {
  if (!href.includes(LEGACY_PATH_PREFIX)) return href;
  return href.split(LEGACY_PATH_PREFIX).join(CATALOG_MEDIA_PUBLIC_PATH_PREFIX);
}
