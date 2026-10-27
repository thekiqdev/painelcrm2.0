/**
 * IX3 — helpers de catálogo multi-moeda / tradução de planos.
 */

export const PLAN_CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export const PLAN_LOCALES = ['pt-BR', 'en', 'es'] as const;
export type PlanLocale = (typeof PLAN_LOCALES)[number];

export function normalizePlanCurrency(raw: string | null | undefined): PlanCurrency | null {
  if (raw == null) return null;
  const c = raw.trim().toUpperCase();
  if (c === 'BRL' || c === 'USD' || c === 'EUR') return c;
  return null;
}

export function normalizePlanLocale(raw: string | null | undefined): PlanLocale | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/_/g, '-');
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  return null;
}

export type PlanBenefitRow = { icon?: string; label: string };

export type PlanCurrencyPriceRow = {
  currency: PlanCurrency;
  price_cents: number;
};

export type PlanTranslationRow = {
  locale: PlanLocale;
  name: string | null;
  description: string | null;
  benefits: PlanBenefitRow[];
};

export type PlanIntervalPriceRow = {
  billing_interval: string;
  currency: PlanCurrency;
  price_per_user_cents: number;
  price_per_instance_cents: number | null;
};

export function publishedCurrenciesForPlan(input: {
  plan_type: string;
  price_cents: number;
  currency_prices: PlanCurrencyPriceRow[];
  interval_prices: PlanIntervalPriceRow[];
}): PlanCurrency[] {
  const set = new Set<PlanCurrency>();
  // BRL sempre publicado se o plano está ativo (preço de lista ou intervalos BRL)
  if (input.plan_type === 'custom') {
    for (const ip of input.interval_prices) {
      set.add(ip.currency);
    }
  } else {
    set.add('BRL');
    for (const cp of input.currency_prices) {
      if (cp.currency !== 'BRL') set.add(cp.currency);
    }
    // extras / avulso em USD/EUR via interval_prices
    for (const ip of input.interval_prices) {
      if (ip.currency !== 'BRL') set.add(ip.currency);
    }
  }
  return PLAN_CURRENCIES.filter((c) => set.has(c));
}

export function planHasCurrency(input: {
  plan_type: string;
  currency: PlanCurrency;
  currency_prices: PlanCurrencyPriceRow[];
  interval_prices: PlanIntervalPriceRow[];
}): boolean {
  if (input.plan_type === 'custom') {
    return input.interval_prices.some((ip) => ip.currency === input.currency);
  }
  if (input.currency === 'BRL') return true;
  return input.currency_prices.some((cp) => cp.currency === input.currency);
}

export function resolveListPriceCents(input: {
  currency: PlanCurrency;
  price_cents_brl: number;
  currency_prices: PlanCurrencyPriceRow[];
}): number {
  if (input.currency === 'BRL') return input.price_cents_brl;
  const row = input.currency_prices.find((c) => c.currency === input.currency);
  return row?.price_cents ?? 0;
}

export function applyPlanTranslation(input: {
  locale: PlanLocale;
  name: string;
  description: string | null;
  benefits: PlanBenefitRow[];
  translations: PlanTranslationRow[];
}): { name: string; description: string | null; benefits: PlanBenefitRow[] } {
  if (input.locale === 'pt-BR') {
    return {
      name: input.name,
      description: input.description,
      benefits: input.benefits,
    };
  }
  const tr = input.translations.find((t) => t.locale === input.locale);
  if (!tr) {
    return {
      name: input.name,
      description: input.description,
      benefits: input.benefits,
    };
  }
  return {
    name: (tr.name && tr.name.trim()) || input.name,
    description:
      tr.description != null && String(tr.description).trim() !== ''
        ? tr.description
        : input.description,
    benefits: Array.isArray(tr.benefits) && tr.benefits.length > 0 ? tr.benefits : input.benefits,
  };
}
