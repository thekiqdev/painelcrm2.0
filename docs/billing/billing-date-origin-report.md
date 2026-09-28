# Billing Date Origin Report — Sprint 4.1J

## Root Cause (confirmado)

**Erro:** `invalid input syntax for type date: "Tue Jun 30"`

**Origem:** `String(pgDateObject).slice(0, 10)` ou `String(value).trim().slice(0, 10)` quando `value` é um objeto `Date` retornado pelo driver `node-pg` em colunas `DATE`.

`Date.prototype.toString()` → `"Tue Jun 30 2026 21:00:00 GMT-0300"`  
`.slice(0, 10)` → **`"Tue Jun 30"`** → PostgreSQL rejeita em `::date`.

## Callers de risco (corrigidos)

| Arquivo | Linha | Função | Caller | Risco | Impacto |
|---------|-------|--------|--------|-------|---------|
| `billingRecurringJobPersistence.ts` | 86 | `computeFinalNextBillingForCompletedCycle` | `advanceSubscriptionAfterCompletedCycle` → worker complete | **CRÍTICO** | SQL `::date` em advance cycle |
| `billingRecurringJobPersistence.ts` | 292 | `cancelBillingRecurringJob` | mismatch guard dual-write | **ALTO** | cycle cancel guard |
| `billingPlanRepository.ts` | 37-39 | `mapRow` | plan reads → provision/repair | **ALTO** | effective_from em items |
| `billingPlanItems/repository.ts` | 45-52 | `mapRow` | `findEffective` → engine context | **CRÍTICO** | invoice generation |
| `billingPlanRepairService.ts` | 18-22 | `resolvePeriodStart` | `repairBillingPlanForSubscription` | **MÉDIO** | provision on open |

## Padrões eliminados

- `String(Date).slice(0,10)` em caminhos billing
- Fallback cego após `normalizeBillingCycleKeyYmd` falhar
- Persistência sem passar por `normalizeBillingDateFromDb()` / `assertBillingDate()`

## Defesa em profundidade (4.1J)

| Camada | Mecanismo |
|--------|-----------|
| Normalização | `normalizeBillingDate()` / `normalizeBillingDateFromDb()` |
| Assertions | `assertBillingDate()`, `assertBillingCycle()`, `assertCycleIntegrity()` |
| SQL Guard | `guardBillingQueryParams()` em `pool.query` |
| Trace | `storage/debug/billing-runtime/runtime-*.json` |
| Auto-repair | `validateBillingRuntime()` ao abrir assinatura |

## Resposta objetiva

**Existe algum caminho que ainda produza Date.toString() para SQL?**  
**NÃO** — bloqueado por guard + assertions; origem legada corrigida.

_Gerado: Sprint 4.1J — RUNTIME CERTIFIED_
