import type { Request, Response } from 'express';
import { isLocaleDetectionEnabled } from '../i18n/i18nFlags.js';
import {
  LOCALE_COOKIE_NAME,
  normalizeAppLocale,
  readCookieHeader,
  resolveAppLocale,
  type AppLocale,
} from '../i18n/appLocale.js';
import {
  readCountryFromRequest,
  resolveRequestCurrency,
  type AppCurrency,
  type CurrencyResolveSource,
} from '../i18n/appCurrency.js';

export type LocaleContextResponse = {
  detection_enabled: boolean;
  locale: AppLocale;
  currency: AppCurrency;
  country: string | null;
  sources: {
    locale: 'query' | 'cookie' | 'accept-language' | 'default' | 'forced';
    currency: CurrencyResolveSource | 'forced';
  };
};

function localeSource(input: {
  query?: string | null;
  cookie?: string | null;
  languages: string[];
}): LocaleContextResponse['sources']['locale'] {
  if (normalizeAppLocale(input.query)) return 'query';
  if (normalizeAppLocale(input.cookie)) return 'cookie';
  for (const lang of input.languages) {
    if (normalizeAppLocale(lang)) return 'accept-language';
  }
  return 'default';
}

/**
 * GET /api/public/locale-context
 * Flag OFF → pt-BR + BRL. Flag ON → cookie / Accept-Language / CF-IPCountry.
 */
export async function getPublicLocaleContext(req: Request, res: Response): Promise<void> {
  try {
    const detectionEnabled = await isLocaleDetectionEnabled();
    const country = readCountryFromRequest(req.headers as { 'cf-ipcountry'?: string });

    if (!detectionEnabled) {
      const body: LocaleContextResponse = {
        detection_enabled: false,
        locale: 'pt-BR',
        currency: 'BRL',
        country,
        sources: { locale: 'forced', currency: 'forced' },
      };
      res.json(body);
      return;
    }

    const queryLang = typeof req.query.lang === 'string' ? req.query.lang : null;
    const queryCurrency = typeof req.query.currency === 'string' ? req.query.currency : null;
    const cookieHeader = req.headers.cookie;
    const acceptLanguage = req.get('accept-language');
    const languages = (acceptLanguage ?? '')
      .split(',')
      .map((p) => p.split(';')[0]?.trim() ?? '')
      .filter(Boolean);

    const cookieLocale = readCookieHeader(cookieHeader, LOCALE_COOKIE_NAME);
    const locale = resolveAppLocale({
      query: queryLang,
      cookie: cookieLocale,
      languages,
    });

    const currencyResolved = resolveRequestCurrency({
      query: queryCurrency,
      cookieHeader,
      country,
    });

    const body: LocaleContextResponse = {
      detection_enabled: true,
      locale,
      currency: currencyResolved.currency,
      country,
      sources: {
        locale: localeSource({ query: queryLang, cookie: cookieLocale, languages }),
        currency: currencyResolved.source,
      },
    };
    res.json(body);
  } catch (error) {
    console.error('[public/locale-context]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
