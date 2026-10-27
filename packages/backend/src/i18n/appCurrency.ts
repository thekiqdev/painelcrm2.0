/**
 * IX2 — resolução de moeda (BRL, USD, EUR) independente do idioma.
 */

import { currencyForCountry, type SupportedCurrency } from './countryCurrencyMap.js';
import { readCookieHeader } from './appLocale.js';

export const CURRENCY_COOKIE_NAME = 'painelcrm_currency';

export const SUPPORTED_APP_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

export type AppCurrency = (typeof SUPPORTED_APP_CURRENCIES)[number];

export const DEFAULT_APP_CURRENCY: AppCurrency = 'USD';

export function normalizeAppCurrency(raw: string | null | undefined): AppCurrency | null {
  if (raw == null) return null;
  const c = raw.trim().toUpperCase();
  if (c === 'BRL' || c === 'USD' || c === 'EUR') return c;
  return null;
}

export function readCountryFromRequest(headers: {
  'cf-ipcountry'?: string | string[];
  'CF-IPCountry'?: string | string[];
}): string | null {
  const raw = headers['cf-ipcountry'] ?? headers['CF-IPCountry'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const cc = value.trim().toUpperCase();
  if (!cc || cc === 'XX' || cc === 'T1') return null; // Cloudflare unknowns / Tor
  if (cc.length !== 2) return null;
  return cc;
}

export type CurrencyResolveSource = 'query' | 'cookie' | 'country' | 'default';

/**
 * Ordem IX2 (detecção ON): query → cookie → país (D6) → USD.
 * Sem país e sem cookie → USD (D5).
 */
export function resolveAppCurrency(input: {
  query?: string | null;
  cookie?: string | null;
  country?: string | null;
}): { currency: AppCurrency; source: CurrencyResolveSource } {
  const fromQuery = normalizeAppCurrency(input.query);
  if (fromQuery) return { currency: fromQuery, source: 'query' };

  const fromCookie = normalizeAppCurrency(input.cookie);
  if (fromCookie) return { currency: fromCookie, source: 'cookie' };

  if (input.country) {
    const mapped = currencyForCountry(input.country) as SupportedCurrency;
    return { currency: mapped, source: 'country' };
  }

  return { currency: DEFAULT_APP_CURRENCY, source: 'default' };
}

export function resolveRequestCurrency(input: {
  query?: string | null;
  cookieHeader?: string | null;
  country?: string | null;
}): { currency: AppCurrency; source: CurrencyResolveSource } {
  return resolveAppCurrency({
    query: input.query,
    cookie: readCookieHeader(input.cookieHeader ?? undefined, CURRENCY_COOKIE_NAME),
    country: input.country,
  });
}
