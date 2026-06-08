/** Identidade operacional oficial do tenant (etapa Empresa do wizard). */

export const PROVISIONAL_COMPANY_NAME = 'Minha operação';
export const PROVISIONAL_SLUG_BASE = 'minha-operacao';

const SLUG_MAX_LEN = 64;

/** Gera slug a partir do nome da operação (regras P0-C). */
export function slugifyOperationalName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) return '';
  return base.slice(0, SLUG_MAX_LEN);
}

/** Normaliza entrada manual do usuário para comparação/validação. */
export function normalizeOperationalSlugInput(raw: string): string {
  return slugifyOperationalName(raw.replace(/_/g, '-'));
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidOperationalSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > SLUG_MAX_LEN) return false;
  return SLUG_PATTERN.test(slug);
}

/** Slug criado no provisionamento tardio antes da etapa Empresa. */
export function isProvisionalOperationalSlug(slug: string | null | undefined): boolean {
  if (!slug) return true;
  const s = slug.trim().toLowerCase();
  if (s === PROVISIONAL_SLUG_BASE) return true;
  return /^minha-operacao(-\d+)?$/.test(s);
}

export function isProvisionalOperationalName(name: string | null | undefined): boolean {
  if (!name) return true;
  return name.trim().toLowerCase() === PROVISIONAL_COMPANY_NAME.toLowerCase();
}
