/** Espelha regras de slug da etapa Empresa (P0-C). */

export function slugifyOperationalName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidOperationalSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 64) return false;
  return SLUG_PATTERN.test(slug);
}
