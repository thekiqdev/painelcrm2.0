import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/lib/i18n/i18n';
import {
  normalizeAppLocale,
  readLocaleCookie,
  resolveAppLocale,
  writeLocaleCookie,
  type AppLocale,
} from '@/lib/i18n/appLocale';
import {
  fetchPublicLocaleContext,
  normalizeAppCurrency,
  readCurrencyCookie,
  writeCurrencyCookie,
  type AppCurrency,
} from '@/lib/i18n/appCurrency';

type LocaleCurrencyContextValue = {
  locale: AppLocale;
  currency: AppCurrency;
  detectionEnabled: boolean;
  country: string | null;
  ready: boolean;
  setLocale: (locale: AppLocale) => void;
  setCurrency: (currency: AppCurrency) => void;
};

const LocaleCurrencyContext = createContext<LocaleCurrencyContextValue | null>(null);

/**
 * IX1 + IX2 — idioma (cookie / perfil / navegador) e moeda (cookie / país via API).
 * Flag OFF: visitante anônimo fica em pt-BR + BRL. Logado: idioma do perfil ainda vale.
 * Moeda da assinatura SaaS (Meu plano) não usa este cookie — só landing/checkout.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryLangRaw = searchParams.get('lang');
  const queryCurrencyRaw = searchParams.get('currency');
  const profileLocale = user?.locale ?? null;
  const clearedQueryRef = useRef(false);

  const [detectionEnabled, setDetectionEnabled] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [currency, setCurrencyState] = useState<AppCurrency>(() => readCurrencyCookie() ?? 'BRL');
  const [locale, setLocaleState] = useState<AppLocale>(() =>
    resolveAppLocale({
      cookie: readLocaleCookie(),
      profile: null,
      languages: typeof navigator !== 'undefined' ? navigator.languages : [],
    })
  );
  const [ready, setReady] = useState(false);

  const applyLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    void i18n.changeLanguage(next);
  }, []);

  const setLocale = useCallback(
    (next: AppLocale) => {
      writeLocaleCookie(next);
      applyLocale(next);
    },
    [applyLocale]
  );

  const setCurrency = useCallback((next: AppCurrency) => {
    writeCurrencyCookie(next);
    setCurrencyState(next);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const queryLang = normalizeAppLocale(queryLangRaw);
    const queryCurrency = normalizeAppCurrency(queryCurrencyRaw);

    void (async () => {
      const ctx = await fetchPublicLocaleContext({
        lang: queryLang,
        currency: queryCurrency,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;

      const detection = ctx?.detection_enabled === true;
      setDetectionEnabled(detection);
      setCountry(ctx?.country ?? null);

      if ((queryLangRaw || queryCurrencyRaw) && !clearedQueryRef.current) {
        clearedQueryRef.current = true;
        const next = new URLSearchParams(window.location.search);
        next.delete('lang');
        next.delete('currency');
        setSearchParams(next, { replace: true });
      }

      if (!detection) {
        if (user) {
          const resolved = resolveAppLocale({
            query: queryLang,
            cookie: readLocaleCookie(),
            profile: profileLocale,
            languages: typeof navigator !== 'undefined' ? navigator.languages : [],
          });
          applyLocale(resolved);
        } else {
          applyLocale('pt-BR');
          setCurrencyState('BRL');
        }
        setReady(true);
        return;
      }

      if (queryLang) writeLocaleCookie(queryLang);
      if (queryCurrency) writeCurrencyCookie(queryCurrency);

      const localeToUse = profileLocale
        ? resolveAppLocale({
            profile: profileLocale,
            cookie: readLocaleCookie(),
            query: queryLang,
          })
        : ctx?.locale ??
          resolveAppLocale({
            query: queryLang,
            cookie: readLocaleCookie(),
            languages: typeof navigator !== 'undefined' ? navigator.languages : [],
          });
      applyLocale(localeToUse);
      if (!profileLocale && !readLocaleCookie() && ctx?.locale) {
        writeLocaleCookie(ctx.locale);
      }

      const currencyToUse = queryCurrency ?? readCurrencyCookie() ?? ctx?.currency ?? 'USD';
      if (!readCurrencyCookie()) writeCurrencyCookie(currencyToUse);
      setCurrencyState(readCurrencyCookie() ?? currencyToUse);
      setReady(true);
    })();

    return () => ac.abort();
    // Intencional: não depende de searchParams inteiro (evita loop ao limpar ?lang=).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryLangRaw, queryCurrencyRaw, profileLocale, user?.id, applyLocale, setSearchParams]);

  const value = useMemo(
    () => ({
      locale,
      currency,
      detectionEnabled,
      country,
      ready,
      setLocale,
      setCurrency,
    }),
    [locale, currency, detectionEnabled, country, ready, setLocale, setCurrency]
  );

  return <LocaleCurrencyContext.Provider value={value}>{children}</LocaleCurrencyContext.Provider>;
}

export function useLocaleCurrency(): LocaleCurrencyContextValue {
  const ctx = useContext(LocaleCurrencyContext);
  if (!ctx) {
    return {
      locale: (normalizeAppLocale(i18n.language) ?? 'pt-BR') as AppLocale,
      currency: readCurrencyCookie() ?? 'BRL',
      detectionEnabled: false,
      country: null,
      ready: true,
      setLocale: (next) => {
        writeLocaleCookie(next);
        document.documentElement.lang = next;
        void i18n.changeLanguage(next);
      },
      setCurrency: (next) => {
        writeCurrencyCookie(next);
      },
    };
  }
  return ctx;
}
