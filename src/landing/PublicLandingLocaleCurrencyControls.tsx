import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchPublicLocaleContext,
  normalizeAppCurrency,
  readCurrencyCookie,
  writeCurrencyCookie,
  type AppCurrency,
} from '@/lib/i18n/appCurrency';
import {
  normalizeAppLocale,
  readLocaleCookie,
  writeLocaleCookie,
  type AppLocale,
} from '@/lib/i18n/appLocale';
import i18n from '@/lib/i18n/i18n';
import { cn } from '@/lib/utils';

/**
 * IX2 — seletor na landing estática (bundle sem AuthProvider / sem i18next).
 * Grava cookies e recarrega para aplicar document.lang.
 */
export function PublicLandingLocaleCurrencyControls({
  className,
  stacked,
}: {
  className?: string;
  stacked?: boolean;
}) {
  const { t } = useTranslation('common');
  const [enabled, setEnabled] = useState(false);
  const [locale, setLocale] = useState<AppLocale>(() => normalizeAppLocale(readLocaleCookie()) ?? 'pt-BR');
  const [currency, setCurrency] = useState<AppCurrency>(() => readCurrencyCookie() ?? 'BRL');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void fetchPublicLocaleContext({ signal: ac.signal }).then((ctx) => {
      if (ac.signal.aborted || !ctx) {
        setReady(true);
        return;
      }
      setEnabled(ctx.detection_enabled);
      if (!ctx.detection_enabled) {
        setLocale('pt-BR');
        setCurrency('BRL');
        document.documentElement.lang = 'pt-BR';
        setReady(true);
        return;
      }
      const nextLocale = normalizeAppLocale(readLocaleCookie()) ?? ctx.locale;
      const nextCurrency = readCurrencyCookie() ?? ctx.currency;
      if (!readLocaleCookie()) writeLocaleCookie(nextLocale);
      if (!readCurrencyCookie()) writeCurrencyCookie(nextCurrency);
      setLocale(nextLocale);
      setCurrency(nextCurrency);
      document.documentElement.lang = nextLocale;
      void i18n.changeLanguage(nextLocale);
      setReady(true);
    });
    return () => ac.abort();
  }, []);

  if (!ready || !enabled) return null;

  const onLocale = (v: string) => {
    const next = normalizeAppLocale(v);
    if (!next) return;
    writeLocaleCookie(next);
    setLocale(next);
    document.documentElement.lang = next;
    void i18n.changeLanguage(next);
  };

  const onCurrency = (v: string) => {
    const next = normalizeAppCurrency(v);
    if (!next) return;
    writeCurrencyCookie(next);
    setCurrency(next);
  };

  return (
    <div
      className={cn(stacked ? 'flex flex-col gap-2' : 'flex items-center gap-2', className)}
      data-testid="landing-locale-currency"
    >
      <Select value={locale} onValueChange={onLocale}>
        <SelectTrigger aria-label={t('language_label')} className="h-8 w-[7.5rem] border-border/60 bg-background/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-BR">{t('language_pt')}</SelectItem>
          <SelectItem value="en">{t('language_en')}</SelectItem>
          <SelectItem value="es">{t('language_es')}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={currency} onValueChange={onCurrency}>
        <SelectTrigger aria-label={t('currency_label')} className="h-8 w-[5.5rem] border-border/60 bg-background/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="BRL">{t('currency_brl')}</SelectItem>
          <SelectItem value="USD">{t('currency_usd')}</SelectItem>
          <SelectItem value="EUR">{t('currency_eur')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
