# IX Sprint 3 — Planos por moeda no Super Admin

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-29 |
| **Sprint** | **IX3** concluída |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Próximo** | **IX4** — Stripe da plataforma (`ok sprint ix4`) |

Flag `billing.multicurrency_v1` default **OFF**. Com OFF, `GET /api/plans` continua só BRL e texto de `plans.*` (sem filtrar USD/EUR).

---

## Entregue

### Migração `349_ix3_plan_multicurrency.sql`

- `plan_interval_prices.currency` (`BRL|USD|EUR`), unique `(plan_id, billing_interval, currency)`, backfill BRL.
- `plan_currency_prices` — preço de lista standard em USD/EUR (`plans.price_cents` = BRL).
- `plan_translations` — nome/descrição/benefícios por `pt-BR|en|es` (fonte pt-BR = tabela `plans`).

### Backend

- Helpers `packages/backend/src/i18n/planMulticurrency.ts` + testes.
- Flag reader `billingMulticurrencyFlags.ts`.
- `plansController`: create/update aceitam `currency_prices` e `translations`; `GET` público com `?currency=&locale=`; omite plano sem preço na moeda pedida (flag ON); fallback de tradução para pt-BR.
- Leituras de billing / checkout / Meu Plano / analytics filtram `currency = 'BRL'` (Asaas intocado).

### Super Admin

- Abas Real / Dólar / Euro (standard: lista + avulso; custom: intervalos por moeda).
- Bloco de tradução en / es.
- Coluna **Moedas** na lista (`published_currencies`).

### Landing

- `Pricing` busca `/api/plans?currency=&locale=` após o LocaleProvider estar `ready`.
- Formatação via `formatAppMoney` / `formatVitrinePriceLabel(currency)`.

---

## Aceite

| Critério | Como |
|----------|------|
| Plano legado só BRL, mesmos centavos | Sem linhas em `plan_currency_prices`; intervalo legado = BRL |
| Super Admin publica USD/EUR; público `currency=USD` devolve e omite sem dólar | Flag ON + `planHasCurrency` |
| `locale=en` com tradução; sem tradução → pt-BR | `applyPlanTranslation` |
| Checkout BRL / Asaas inalterado | Queries de cobrança pinadas em BRL |

**Fora desta sprint:** Product/Price Stripe (IX4); chrome Super Admin traduzido (IX9).
