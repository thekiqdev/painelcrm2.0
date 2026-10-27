/**
 * IX0 — mapa país → moeda (decisão D6 do plano IX).
 * A IX2 consome via GET /api/public/locale-context quando i18n.locale_detection_v1 está ON.
 * Com a flag OFF o visitante continua em BRL.
 */

export const COUNTRY_CURRENCY_MAP_VERSION = 1 as const;

export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO 3166-1 alpha-2 da zona do euro (decisão D6). Grécia = GR. */
export const EUROZONE_COUNTRY_CODES = [
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
] as const;

const EUROZONE = new Set<string>(EUROZONE_COUNTRY_CODES);

/**
 * Moeda sugerida para um código de país.
 * Sem país (header ausente) cai em USD, que é o fallback da decisão D5.
 */
export function currencyForCountry(countryCode: string | null | undefined): SupportedCurrency {
  const cc = (countryCode ?? '').trim().toUpperCase();
  if (cc === 'BR') return 'BRL';
  if (cc.length === 2 && EUROZONE.has(cc)) return 'EUR';
  return 'USD';
}
