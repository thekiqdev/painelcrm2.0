import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocaleCurrency } from '@/lib/i18n/LocaleProvider';
import type { AppLocale } from '@/lib/i18n/appLocale';
import type { AppCurrency } from '@/lib/i18n/appCurrency';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  /** Compacto no mobile hamburger */
  stacked?: boolean;
};

/**
 * IX2 — seletor de idioma e moeda na landing.
 * Só aparece com i18n.locale_detection_v1 ON.
 */
export function LandingLocaleCurrencyControls({ className, stacked }: Props) {
  const { t } = useTranslation('common');
  const { locale, currency, detectionEnabled, ready, setLocale, setCurrency } = useLocaleCurrency();

  if (!ready || !detectionEnabled) return null;

  return (
    <div
      className={cn(
        stacked ? 'flex flex-col gap-2' : 'flex items-center gap-2',
        className
      )}
      data-testid="landing-locale-currency"
    >
      <Select value={locale} onValueChange={(v) => setLocale(v as AppLocale)}>
        <SelectTrigger
          aria-label={t('language_label')}
          className="h-8 w-[7.5rem] border-border/60 bg-background/60 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-BR">{t('language_pt')}</SelectItem>
          <SelectItem value="en">{t('language_en')}</SelectItem>
          <SelectItem value="es">{t('language_es')}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={currency} onValueChange={(v) => setCurrency(v as AppCurrency)}>
        <SelectTrigger
          aria-label={t('currency_label')}
          className="h-8 w-[5.5rem] border-border/60 bg-background/60 text-xs"
        >
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
