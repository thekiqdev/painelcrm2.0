# Sprint 5.0-22 — Billing Aggregate Cutover

**Modo:** IMPLEMENTATION (CUTOVER)  
**Branch:** `feature/billing-cutover`  
**Status:** Concluída

## Objetivo

Promover o `BillingAggregate` como **única fonte de dados** consumida pela UI de billing, mantendo o `FinancialEventStore` compilado apenas para rollback.

## Arquitetura do cutover

```
CrmSubscriptionDetailPayload
        │
        ▼
createBillingExperienceStore()  ◄── VITE_BILLING_USE_AGGREGATE (default: true)
        │
        ├── true  → buildBillingAggregateFromDetail()
        │              → billingViewAdapter.buildStoreEventsFromAggregate()
        │              → FinancialEventStore(prebuilt)  ← API inalterada para React
        │
        └── false → FinancialEventStore(legacy builders)  ← rollback
```

A UI **não foi alterada** — todos os componentes continuam usando `useFinancialEventStore()` e a mesma API de métodos (`getHistoryRows`, `getCalendarEvents`, etc.).

## Feature flags

| Flag | Default | Descrição |
|------|---------|-----------|
| `VITE_BILLING_USE_AGGREGATE` | **true** | Aggregate como fonte oficial da UI |
| `VITE_BILLING_SHADOW_MODE` | **false** | Shadow/diagnóstico (legacy em paralelo) |

### Rollback imediato

```env
VITE_BILLING_USE_AGGREGATE=false
```

Rebuild/restart — UI volta ao motor legado sem migração de dados.

## Entregáveis

| Entregável | Arquivo |
|------------|---------|
| Billing View Adapter | `src/lib/billingCutover/billingViewAdapter.ts` |
| Experience Store Factory | `src/lib/billingCutover/createBillingExperienceStore.ts` |
| Cutover Feature Flags | `src/lib/billingCutover/featureFlag.ts` |
| Provider (alias) | `BillingExperienceProvider` = `FinancialEventStoreProvider` |
| Legacy isolation | `FinancialEventStore` legado intacto (constructor `prebuilt` opcional) |
| Testes cutover | `tests/billing/cutover/billingCutover.test.ts` |

## O que NÃO foi alterado

- Nenhum Stage do `BillingAggregate`
- Payload do backend
- Componentes React (exceto provider wiring)
- Regras certificadas 5.0-21E
- Shadow Runtime (mecanismo preservado, default off)

## Testes

```bash
npm run test:billing   # 723 passed (25 files)
```

### Certification snapshots (cutover)

Após o cutover, **4 cenários** do Golden Dataset tiveram snapshots atualizados para refletir a saída oficial do Aggregate (divergência residual certificada em 5.0-21D):

| Cenário | Mudança principal |
|---------|-------------------|
| `charge-early-generated` | eventType/status alinhados ao Aggregate |
| `cancelled-official` | ciclo cancelado → `invoice_cancelled` / `Cancelado` |
| `cancelled-legacy` | ciclo cancelado → `invoice_cancelled` / `Cancelado` |
| `cycle-skipped` | histórico deduplicado (1 linha/ciclo, parity 21D) |

Os demais **36 cenários** permaneceram byte-identical.

### Rollback validado

- `setBillingUseAggregateForTests(false)` → motor legado via `FinancialEventStore` builders
- `tests/billing/cutover/billingCutover.test.ts` — 3 testes green

## Próxima Sprint (5.0-23)

**Billing Legacy Removal** — remover `FinancialEventStore`, builders legados, adapters temporários e flags de cutover após período de estabilização.
