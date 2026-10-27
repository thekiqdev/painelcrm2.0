import {
  normalizeAppLocale,
  type AppLocale,
  LOCALE_COOKIE_NAME,
} from '@/lib/i18n/appLocale';

export const CURRENCY_COOKIE_NAME = 'painelcrm_currency';

export const APP_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

export type AppCurrency = (typeof APP_CURRENCIES)[number];

export const DEFAULT_APP_CURRENCY: AppCurrency = 'USD';

const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export function normalizeAppCurrency(raw: string | null | undefined): AppCurrency | null {
  if (raw == null) return null;
  const c = raw.trim().toUpperCase();
  if (c === 'BRL' || c === 'USD' || c === 'EUR') return c;
  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
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

export function readCurrencyCookie(): AppCurrency | null {
  return normalizeAppCurrency(readCookie(CURRENCY_COOKIE_NAME));
}

export function writeCurrencyCookie(currency: AppCurrency): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CURRENCY_COOKIE_NAME}=${encodeURIComponent(currency)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export type LocaleContextApi = {
  detection_enabled: boolean;
  locale: AppLocale;
  currency: AppCurrency;
  country: string | null;
};

export async function fetchPublicLocaleContext(init?: {
  lang?: string | null;
  currency?: string | null;
  signal?: AbortSignal;
}): Promise<LocaleContextApi | null> {
  const params = new URLSearchParams();
  if (init?.lang) params.set('lang', init.lang);
  if (init?.currency) params.set('currency', init.currency);
  const qs = params.toString();
  const url = `/api/public/locale-context${qs ? `?${qs}` : ''}`;
  try {
    const headers: HeadersInit = { Accept: 'application/json' };
    const localeCookie = readCookie(LOCALE_COOKIE_NAME);
    if (localeCookie) headers['X-App-Locale'] = localeCookie;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers,
      signal: init?.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LocaleContextApi;
    if (!data || typeof data.detection_enabled !== 'boolean') return null;
    const locale = normalizeAppLocale(data.locale) ?? 'pt-BR';
    const currency = normalizeAppCurrency(data.currency) ?? 'BRL';
    return {
      detection_enabled: data.detection_enabled,
      locale,
      currency,
      country: data.country ?? null,
    };
  } catch {
    return null;
  }
}
