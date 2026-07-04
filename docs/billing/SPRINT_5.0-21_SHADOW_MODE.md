# Sprint 5.0-21 — Billing Shadow Mode Runtime

**Branch:** `feature/billing-shadow-mode`  
**Commit:** `feat(billing): add Billing Shadow Mode runtime`  
**Status:** Concluída

## Objetivo

Executar o **BillingAggregate** em paralelo ao **FinancialEventStore** em todas as telas do Billing, mantendo o motor legado como **única fonte da UI**. O Aggregate apenas produz resultados e registra métricas/snapshots para certificação futura (5.0-21A).

## Arquivos alterados / criados

| Arquivo | Papel |
|---------|-------|
| `src/lib/billingShadow/featureFlag.ts` | `isBillingShadowModeEnabled()` |
| `src/lib/billingShadow/shadowSnapshot.ts` | Snapshots legado + Aggregate |
| `src/lib/billingShadow/shadowRuntime.ts` | Runtime, report, performance |
| `src/lib/billingShadow/index.ts` | API pública |
| `src/lib/subscriptionFinancialEventStore.ts` | Hook em `createFinancialEventStore` |
| `src/vite-env.d.ts` | `VITE_BILLING_SHADOW_MODE` |
| `tests/billing/shadow/shadowRuntime.test.ts` | Testes do runtime |
| `docs/billing/SPRINT_5.0-21_SHADOW_MODE.md` | Este documento |

## Feature flag

```bash
# Default: desligado
VITE_BILLING_SHADOW_MODE=false

# Ativar Shadow Mode (dev / staging)
VITE_BILLING_SHADOW_MODE=true
```

Quando **off**: comportamento idêntico ao pré-5.0-21 (apenas `new FinancialEventStore`).

## Fluxo

```
createFinancialEventStore(detail, today)
  │
  ├─ flag OFF → FinancialEventStore → UI
  │
  └─ flag ON
       ├─ medir legacyMs
       ├─ FinancialEventStore (retorno para UI)
       ├─ buildBillingAggregateFromDetail (paralelo)
       ├─ medir aggregateMs
       ├─ buildLegacyShadowSnapshot + buildAggregateShadowSnapshot
       ├─ ShadowExecutionReport (memória + log DEV)
       └─ retornar store legado (UI inalterada)
```

## Deliverables

| Deliverable | Implementação |
|-------------|----------------|
| BillingShadowRuntime | `runBillingShadowSideEffect` |
| ShadowSnapshotBuilder | `buildLegacyShadowSnapshot`, `buildAggregateShadowSnapshot` |
| ShadowExecutionReport | tipo + `getLastShadowExecutionReport()` |
| Feature flag | `VITE_BILLING_SHADOW_MODE` / `isBillingShadowModeEnabled` |
| Performance metrics | `legacyMs`, `aggregateMs`, `totalMs` |
| Integração | `createFinancialEventStore` (todas as telas que usam o store) |

## Isolamento

- UI **nunca** lê `aggregate.*`
- Erros do Aggregate são capturados em `aggregateError` — store legado sempre retorna
- Logs apenas em `import.meta.env.DEV`
- Snapshots de certificação visual **não mudam** (flag default off)

## Testes

```bash
npm run test:billing
```

Inclui `tests/billing/shadow/shadowRuntime.test.ts` + suítes existentes (Golden, Certification, Regression).

## Próxima Sprint (5.0-21A)

**Billing Shadow Certification** — comparar automaticamente os snapshots legado vs Aggregate e produzir relatório de equivalência (CERT-15).
