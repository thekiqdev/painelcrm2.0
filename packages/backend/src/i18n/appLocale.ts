/**
 * IX1 — locales canônicos da interface: pt-BR, en, es.
 * en-US (e qualquer en-*) é alias de leitura para en. pt e pt-* caem em pt-BR.
 */

export const APP_LOCALES = ['pt-BR', 'en', 'es'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'pt-BR';

export const LOCALE_COOKIE_NAME = 'painelcrm_locale';

const LOCALE_ERROR_MESSAGES = {
  invalid_locale: {
    'pt-BR': 'Idioma inválido. Use pt-BR, en ou es.',
    en: 'Invalid language. Use pt-BR, en or es.',
    es: 'Idioma no válido. Use pt-BR, en o es.',
  },
} as const;

export type LocaleErrorKey = keyof typeof LOCALE_ERROR_MESSAGES;

export function normalizeAppLocale(raw: string | null | undefined): AppLocale | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/_/g, '-');
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  return null;
}

/**
 * Valor gravado em profiles.locale.
 * Vazio vira null (sem preferência). Texto fora do catálogo é inválido.
 */
export function canonicalizeStoredLocale(
  raw: string | null | undefined
): { ok: true; locale: AppLocale | null } | { ok: false } {
  if (raw == null) return { ok: true, locale: null };
  if (raw.trim() === '') return { ok: true, locale: null };
  const locale = normalizeAppLocale(raw);
  if (!locale) return { ok: false };
  return { ok: true, locale };
}

export function readCookieHeader(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function localesFromAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
}

/**
 * Ordem IX1: query, cookie, perfil, idiomas do cliente (navigator ou Accept-Language), pt-BR.
 */
export function resolveAppLocale(input: {
  query?: string | null;
  cookie?: string | null;
  profile?: string | null;
  languages?: readonly string[] | null;
}): AppLocale {
  for (const candidate of [input.query, input.cookie, input.profile]) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }
  for (const candidate of input.languages ?? []) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_APP_LOCALE;
}

export function resolveRequestLocale(input: {
  query?: string | null;
  cookieHeader?: string | null;
  appLocaleHeader?: string | null;
  acceptLanguage?: string | null;
  profile?: string | null;
}): AppLocale {
  return resolveAppLocale({
    query: input.query,
    cookie: readCookieHeader(input.cookieHeader ?? undefined, LOCALE_COOKIE_NAME),
    profile: input.profile,
    languages: [
      input.appLocaleHeader ?? '',
      ...localesFromAcceptLanguage(input.acceptLanguage),
    ],
  });
}

export function localeErrorMessage(locale: AppLocale, key: LocaleErrorKey): string {
  return LOCALE_ERROR_MESSAGES[key][locale];
}
