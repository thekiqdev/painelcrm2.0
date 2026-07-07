# Sprint 5.0-22B — Billing UI Aggregate Wiring

**Modo:** IMPLEMENTATION (UI_WIRING)  
**Status:** Concluída  
**Pré-requisito:** Sprint 5.0-22 (Cutover), 5.0-22A (Certification)

## Objetivo

Eliminar dependências residuais do motor legado na camada React, fazendo a UI consumir **diretamente o BillingAggregate** via adapters e façade do `FinancialEventStore`.

## Arquitetura pós-wiring

```
CrmSubscriptionDetailPayload
        │
        ▼
buildBillingAggregateFromDetail()     [inalterado — pipeline 4.2R]
        │
        ▼
buildAggregateStorePrebuilt()         [BillingViewAdapter v2]
        │
        ├── events / history / calendar / sidebar / nextInvoice
        ├── alerts (humanizer) / capabilities / header / technical
        │
        ▼
FinancialEventStore (façade)          [sem recomputação quando prebuilt]
        │
        ▼
React components                      [useFinancialEventStore() API inalterada]
```

## Entregáveis

| Entregável | Arquivo |
|------------|---------|
| BillingViewAdapter v2 | `src/lib/billingCutover/billingViewAdapter.ts` + `adapters/*` |
| Store prebuilt builder | `src/lib/billingCutover/buildAggregateStorePrebuilt.ts` |
| Alert humanizer | `src/lib/billingCutover/alertHumanizer.ts` |
| UI capabilities | `src/lib/billingCutover/adapters/uiCapabilitiesAdapter.ts` |
| UI invoice actions | `src/lib/billingCutover/billingUiActions.ts` |
| Store façade | `src/lib/subscriptionFinancialEventStore.ts` (prebuilt path) |
| Wiring tests | `tests/billing/wiring/billingUiWiring.test.ts` |

## Auditoria obrigatória (respostas)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | `buildFinancialAlerts` montado na UI? | **Não** — substituído por `store.getFinancialAlerts()` ← `aggregate.alerts` |
| 2 | `cycleSupportsManualGenerate` montado? | **Não** — `generateCycleIds` via `store.getUiCapabilities()` |
| 3 | `invoiceCapabilities` montado? | **Não** (path aggregate) — `billingUiActions.resolveUiInvoiceActions` |
| 4 | `resolveFirstEligibleCycle` montado? | **Não** — `aggregate.nextInvoice` |
| 5 | `detail.timeline` na UI? | **Não** nos componentes montados |
| 6 | `detail.cycles_raw` na UI? | **Não** — TechnicalAccordion usa `store.getAggregate()?.cycles` |
| 7 | History reconstruído? | **Não** — `aggregate.history` → adapter → store |
| 8 | Calendar reconstruído? | **Não** — `aggregate.calendar` → adapter → store |
| 9 | Sidebar reconstruída? | **Não** — `aggregate.sidebar` → adapter → store |
| 10 | NextInvoice reconstruída? | **Não** — `aggregate.nextInvoice` → adapter → store |
| 11 | Alerts reconstruídos? | **Não** — `aggregate.alerts` → humanizer → store |
| 12 | Capabilities reconstruídas? | **Não** — `aggregate.capabilities` + cycle lists → adapter |
| 13 | Helpers legados montados | **2 fallbacks rollback only** (`InvoiceDirectActions`, store legacy path) |
| 14 | Store com regra de negócio? | **Não** no path aggregate — apenas entrega prebuilt |
| 15 | UI 100% Aggregate? | **Sim** (path default `VITE_BILLING_USE_AGGREGATE=true`) |

## Testes

```bash
npm run test:billing   # 727 passed (26 files)
```

Snapshots atualizados (6 cenários): alerts aggregate + `cycle-skipped` history visível.

## Rollback

`VITE_BILLING_USE_AGGREGATE=false` — store legado com fallbacks em `getHeaderData` / `getFinancialAlerts`.

## Próxima sprint

**5.0-23 Billing Legacy Removal** — remover builders legados, façade temporária e feature flags.
