import { describe, expect, it } from 'vitest';
import {
  applyPlanTranslation,
  normalizePlanCurrency,
  normalizePlanLocale,
  planHasCurrency,
  publishedCurrenciesForPlan,
  resolveListPriceCents,
} from './planMulticurrency.js';

describe('planMulticurrency (IX3)', () => {
  it('normaliza moeda e locale', () => {
    expect(normalizePlanCurrency('usd')).toBe('USD');
    expect(normalizePlanLocale('en-US')).toBe('en');
    expect(normalizePlanLocale('pt')).toBe('pt-BR');
  });

  it('lista moedas publicadas', () => {
    expect(
      publishedCurrenciesForPlan({
        plan_type: 'standard',
        price_cents: 9900,
        currency_prices: [{ currency: 'USD', price_cents: 2900 }],
        interval_prices: [],
      })
    ).toEqual(['BRL', 'USD']);

    expect(
      publishedCurrenciesForPlan({
        plan_type: 'custom',
        price_cents: 0,
        currency_prices: [],
        interval_prices: [
          {
            billing_interval: 'monthly',
            currency: 'EUR',
            price_per_user_cents: 500,
            price_per_instance_cents: null,
          },
        ],
      })
    ).toEqual(['EUR']);
  });

  it('omite plano sem preço na moeda estrangeira', () => {
    expect(
      planHasCurrency({
        plan_type: 'standard',
        currency: 'USD',
        currency_prices: [],
        interval_prices: [],
      })
    ).toBe(false);
    expect(
      planHasCurrency({
        plan_type: 'standard',
        currency: 'BRL',
        currency_prices: [],
        interval_prices: [],
      })
    ).toBe(true);
    expect(
      planHasCurrency({
        plan_type: 'custom',
        currency: 'BRL',
        currency_prices: [],
        interval_prices: [],
      })
    ).toBe(false);
    expect(
      planHasCurrency({
        plan_type: 'custom',
        currency: 'BRL',
        currency_prices: [],
        interval_prices: [
          {
            billing_interval: 'monthly',
            currency: 'BRL',
            price_per_user_cents: 100,
            price_per_instance_cents: null,
          },
        ],
      })
    ).toBe(true);
  });

  it('preço BRL antigo não muda quando existe preço em outra moeda', () => {
    expect(
      resolveListPriceCents({
        currency: 'BRL',
        price_cents_brl: 9900,
        currency_prices: [
          { currency: 'USD', price_cents: 2900 },
          { currency: 'EUR', price_cents: 2700 },
        ],
      })
    ).toBe(9900);
    expect(
      applyPlanTranslation({
        locale: 'pt-BR',
        name: 'Pro',
        description: 'desc',
        benefits: [{ label: 'pt' }],
        translations: [{ locale: 'en', name: 'Pro EN', description: 'en', benefits: [{ label: 'en' }] }],
      }).name
    ).toBe('Pro');
  });

  it('resolve preço de lista e tradução com fallback', () => {
    expect(
      resolveListPriceCents({
        currency: 'USD',
        price_cents_brl: 9900,
        currency_prices: [{ currency: 'USD', price_cents: 2900 }],
      })
    ).toBe(2900);

    expect(
      applyPlanTranslation({
        locale: 'en',
        name: 'Pro',
        description: 'pt desc',
        benefits: [{ label: 'pt' }],
        translations: [
          {
            locale: 'en',
            name: 'Pro EN',
            description: null,
            benefits: [{ label: 'en benefit' }],
          },
        ],
      })
    ).toEqual({
      name: 'Pro EN',
      description: 'pt desc',
      benefits: [{ label: 'en benefit' }],
    });
  });
});
