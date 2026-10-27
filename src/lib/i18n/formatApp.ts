import { format } from 'date-fns';
import { enUS, es, ptBR } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import i18n from '@/lib/i18n/i18n';
import { normalizeAppLocale, type AppLocale } from '@/lib/i18n/appLocale';

const DATE_FNS_LOCALES: Record<AppLocale, Locale> = {
  'pt-BR': ptBR,
  en: enUS,
  es,
};

const INTL_LOCALES: Record<AppLocale, string> = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
};

/** Data estável do piloto em Preferências (15 de março de 2026, meio-dia local). */
export const PILOT_SAMPLE_AT = new Date(2026, 2, 15, 12, 0, 0);

export const PILOT_SAMPLE_CENTS = 12345;

export function activeAppLocale(): AppLocale {
  return normalizeAppLocale(i18n.language) ?? 'pt-BR';
}

/** Locale do date-fns alinhado ao idioma ativo (IX7). */
export function dateFnsLocale(locale: AppLocale = activeAppLocale()): Locale {
  return DATE_FNS_LOCALES[locale];
}

export function formatAppDate(
  value: Date | string | number,
  pattern = 'P',
  locale: AppLocale = activeAppLocale()
): string {
  const date = value instanceof Date ? value : new Date(value);
  return format(date, pattern, { locale: DATE_FNS_LOCALES[locale] });
}

function moneyCurrency(currency: string): string {
  const code = (currency || 'BRL').trim().toUpperCase();
  return code === 'USD' || code === 'EUR' || code === 'BRL' ? code : 'BRL';
}

export function formatAppMoney(
  amountCents: number,
  currency: string,
  locale: AppLocale = activeAppLocale()
): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'currency',
    currency: moneyCurrency(currency),
  }).format(amountCents / 100);
}

/** Valor já em unidades (reais, dólares), não em centavos. */
export function formatAppMoneyMajor(
  amount: number,
  currency: string,
  locale: AppLocale = activeAppLocale()
): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'currency',
    currency: moneyCurrency(currency),
  }).format(amount);
}
