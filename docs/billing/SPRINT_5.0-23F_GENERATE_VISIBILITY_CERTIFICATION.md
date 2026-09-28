# Sprint 5.0-23F — Generate Visibility Certification

**Modo:** INVESTIGATION + FIX  
**Data:** 2026-07-07  
**Testes:** `npm run test:billing` — **738/738** · `subscriptionBillingVisibility.test.ts` — **5/5**

---

## 1. Quem escondia o botão Gerar

### BUG 1 — Invoice apagada (`invoice_id = NULL`, `status = pending`)

| # | Arquivo | Função | Linha | Regra que forçava `canGenerate = false` |
|---|---------|--------|-------|-------------------------------------------|
| R1 | `src/lib/billingCutover/adapters/historyAdapter.ts` | `cycleInvoiceRowActions` | ~45 | `GENERATABLE_CYCLE_STATUSES.has(cycle.status)` — bloqueava `invoiced` e outros status mesmo sem `invoice_id` |
| R2 | `src/lib/resolvedCompetencyPresentation.ts` | `invoiceBasedCycleActions` | ~83-84 | Mesmo gate `GENERATABLE_CYCLE_STATUSES` em modos HISTORY/CALENDAR/NEXT_CARD |
| R3 | `src/lib/resolvedCompetencyPresentation.ts` | `invoiceBasedCycleActions` | ~77-78 | `failed` com `invoice_id` null retornava `canGenerate: false` via lógica de reprocess |
| R4 | `src/lib/billingCutover/adapters/historyAdapter.ts` | `cycleInvoiceRowActions` | ~60 | Priorizava `row.metadata.invoiceId` (evento stale) sobre `cycle.invoiceId` — UI via `InvoiceDirectActions` quando `row.invoiceId` truthy |
| R5 | `src/lib/subscriptionFinancialEventStore.ts` | `getHistoryRows` (path legado) | ~253-268 | Delegava a `resolveCyclePresentation` → OCRE + `GENERATABLE_CYCLE_STATUSES` |

**Cadeia auditada (aggregate path):**

```
subscription_cycles (GET cycles_raw)
  → buildBillingAggregateFromDetail
  → historyStage
  → buildHistoryRowsFromAggregate (historyAdapter)
  → FinancialEventStore (prebuilt historyRows)
  → FinancialHistoryRow → HistoryRowChargeAction
```

**Ponto exato onde `canGenerate` virava false (antes do fix):**  
`historyAdapter.ts` → `cycleInvoiceRowActions()` → retorno `canGenerateNow: false` quando `!GENERATABLE_CYCLE_STATUSES.has(cycle.status)`.

### BUG 2 — Próxima competência após gerar cobrança

| # | Arquivo | Função | Linha | Quebra |
|---|---------|--------|-------|--------|
| S1 | `src/lib/subscriptionFinancialEventStore.ts` | `financialEventStoreSignature` | ~547-552 | Assinatura **não incluía `cycles_raw`** — store React não reconstruía após materialização só no GET |
| S2 | `src/lib/billingAggregate/BillingContext.ts` | `billingContextSourceSignature` | ~5-10 | Mesmo gap na assinatura do aggregate |
| S3 | `src/lib/billingAggregate/nextInvoiceSnapshot.ts` | `resolveNextInvoiceFromAggregate` | ~96 | Dependia só do OCRE `NEXT_CARD`; ciclo materializado sem match OCRE não aparecia no NextCard |

**Etapa onde a competência “sumia”:** entre **GET** (cycle presente em `cycles_raw`) e **Store** (cache stale por assinatura incompleta). Aggregate/history passavam a refletir após rebuild forçado.

### BUG 3 — Regras duplicadas removidas

Substituídas por regra única exportada em `invoiceVisibilityFromCycle()`:

```
invoice_id != NULL  → Abrir (canOpen)
invoice_id == NULL  → Gerar (canGenerate)
subscription.status == 'cancelled' → nenhum botão
```

Removido de adapters/capabilities:
- `GENERATABLE_CYCLE_STATUSES` em `historyAdapter`, `resolvedCompetencyPresentation`, `calendarAdapter`, `uiCapabilitiesAdapter`, `capabilitiesSnapshot`
- OCRE `NEXT_GENERATE` como gate de visibilidade Gerar na UI

**OCRE core (`operationalCompetencyResolverCore.ts`) não foi alterado.**

---

## 2. Arquivos alterados (Sprint 23F)

| Arquivo | Mudança |
|---------|---------|
| `src/lib/resolvedCompetencyPresentation.ts` | `invoiceVisibilityFromCycle()` — SSOT da regra Gerar/Abrir |
| `src/lib/billingCutover/adapters/historyAdapter.ts` | `cycleInvoiceRowActions` usa só `cycle.invoiceId` + regra invoice |
| `src/lib/billingCutover/adapters/calendarAdapter.ts` | `calendarSupportsGenerate` por `invoice_id` |
| `src/lib/billingCutover/adapters/uiCapabilitiesAdapter.ts` | `generateCycleIds` / `canGenerate` por `invoice_id` |
| `src/lib/billingAggregate/capabilitiesSnapshot.ts` | `canGenerate` e `cycleSupportsManualGenerateFromAggregate` por `invoice_id` |
| `src/lib/billingAggregate/nextInvoiceSnapshot.ts` | Fallback: primeiro ciclo sem invoice ≥ hoje |
| `src/lib/billingAggregate/BillingContext.ts` | Assinatura inclui fingerprint `cycles_raw` |
| `src/lib/subscriptionFinancialEventStore.ts` | Assinatura + path legado `getHistoryRows` com regra invoice |
| `src/lib/subscriptionBillingVisibility.test.ts` | Testes de certificação 23F (novo) |
| `src/lib/subscriptionFinancialGenerateActions.test.ts` | Expectativa alinhada à regra invoice |
| `src/lib/operationalCompetencyResolver.test.ts` | Idem |
| `tests/billing/snapshots/*.json` | Golden dataset atualizado |

---

## 3. Critérios de aceite

### Cenário 1 — Apagar invoice → botão Gerar reaparece

- `cycle.invoiceId = null` → `canGenerateNow = true` em histórico (teste `BUG 1` em `subscriptionBillingVisibility.test.ts`)
- `status = invoiced` sem invoice não bloqueia mais Gerar

### Cenário 2 — Gerar cobrança → próxima competência imediata

- Assinatura do store muda quando `cycles_raw` ganha linha (teste `BUG 2 — store signature`)
- `aggregate.nextInvoice.cycleId` aponta para ciclo materializado sem invoice (teste `BUG 2 — nextInvoice`)
- `resolveCyclePresentation(..., 'NEXT_CARD').canGenerate === true`

### Prints dos cenários

> **Pendente captura manual no browser** (dev server + assinatura `bf6683bb-9975-4138-9e5b-05627e612363` ou equivalente):
> 1. Apagar invoice → histórico mostra **Gerar agora**
> 2. Gerar cobrança → NextCard + histórico mostram Aug/06 com **Gerar cobrança**

---

## 4. Confirmação de escopo — sistemas não alterados neste sprint

| Sistema | Alterado em 23F? |
|---------|------------------|
| Scheduler | **Não** |
| Worker (`runRecurringWorker`) | **Não** |
| WhatsApp | **Não** |
| Gateway (Mercado Pago / cobrança) | **Não** |
| Materializer / Planner | **Não** |
| OCRE core (`operationalCompetencyResolverCore.ts`) | **Não** |

Alterações restritas a **adapters de apresentação**, **assinatura do store** e **fallback de nextInvoice no aggregate builder** (call-site, não core).
