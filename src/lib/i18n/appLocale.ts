export const APP_LOCALES = ['pt-BR', 'en', 'es'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'pt-BR';

export const LOCALE_COOKIE_NAME = 'painelcrm_locale';

const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

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

export function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${LOCALE_COOKIE_NAME}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const value = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function writeLocaleCookie(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
