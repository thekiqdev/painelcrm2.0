# Sprint 5.0-23B — Operational Competency Resolution Engine (OCRE) Migration Report

**Data:** 2026-07-06  
**Status:** IMPLEMENTED  
**Dependências:** ADR-001 (ACEITO), ADR-002 (ACEITO), Sprint 5.0-23A (IMPLEMENTADA)

---

## Objetivo

Eliminar lógica duplicada de escolha de competência financeira. Toda decisão de **qual competência utilizar** passa obrigatoriamente pelo `OperationalCompetencyResolver`.

---

## Novos módulos

| Módulo | Arquivo | Responsabilidade |
|--------|---------|------------------|
| **OCRE Core** | `src/lib/operationalCompetencyResolverCore.ts` | Algoritmo puro (sem I/O); SSOT da resolução |
| **OCRE Frontend** | `src/lib/operationalCompetencyResolver.ts` | Adapter UI / Aggregate / Store |
| **OCRE Backend** | `packages/backend/src/services/operationalCompetencyResolver.ts` | `resolveOperationalCompetency`, gap materialization via Planner+Materializer |

---

## Ordem oficial de resolução

1. Ciclo explícito (`preferredCycleId` / `preferredDueDate`)
2. Competência operacional mais antiga sem invoice e status gerável
3. Gap cronológico → `WAITING_MATERIALIZATION` (backend materializa via 23A)
4. Sem competência → `PROJECTION_ONLY` (`canGenerate = false`)

---

## Superfícies migradas

| Superfície | Antes | Depois |
|------------|-------|--------|
| FAB / Gerar Próxima | `resolveFirstEligibleCycle()` | `resolveOperationalCompetency({ mode: 'NEXT_GENERATE' })` |
| Manual Generate (API) | `findEarliestUninvoicedCycle()` | `resolveCycleForManualGeneration()` |
| History `canGenerateNow` | lógica local | OCRE `HISTORY` |
| Calendar | `cycleSupportsManualGenerate()` | OCRE `CALENDAR` |
| NextInvoiceCard | `resolveNextInvoice()` competência | OCRE `NEXT_CARD` |
| Delete Invoice | detach only | `resolveAfterInvoiceDelete()` |
| Aggregate snapshots | múltiplos algoritmos | `operationalCompetencyResolverCore` |

---

## Grep gate

| Padrão | Status |
|--------|--------|
| `findEarliestUninvoicedCycle(` | **Removido** do codebase |
| `resolveFirstEligibleCycle(` | Apenas wrapper deprecated em `operationalCompetencyResolver.ts` + testes |
| `cycleSupportsManualGenerate(` como algoritmo | **Removido** — wrapper delega ao OCRE |

---

## Mudança de comportamento (intencional)

Antes (4.2L): múltiplos ciclos abertos podiam exibir **Gerar** simultaneamente (ex.: Jul + Out com gap em Ago).

Depois (23B): apenas a **próxima competência operacional** é gerável. Gaps bloqueiam ciclos posteriores até materialização.

---

## Compatibilidade preservada

Billing Engine, Scheduler, Worker, Aggregate Pipeline, Materializer, Planner, Gateway, WhatsApp, Email, Timeline e schema de banco: **inalterados**.

---

## Testes

| Arquivo | Cobertura |
|---------|-----------|
| `src/lib/operationalCompetencyResolver.test.ts` | Casos 1–8, HISTORY, gap, cancelled, projection |
| `packages/backend/src/services/operationalCompetencyResolver.test.ts` | Gap materialization, manual generation |
| Golden dataset + regressions 4.2L/4.2N | Atualizados para semântica single-next |

**Resultado:** `npm run test:billing` → **738/738**; OCRE unit tests → **10/10** (frontend) + **2/2** (backend).

---

## Mapa de ownership

```
operationalCompetencyResolverCore   → QUAL competência (algoritmo único)
operationalCompetencyResolver (FE)  → Adapter detail → context
operationalCompetencyResolver (BE)  → DB cycles + gap materialization
SubscriptionCyclePlanner            → Planeja gap (23A)
SubscriptionCycleMaterializer       → Materializa gap (23A)
Billing Engine                      → Gera invoice (recebe competência resolvida)
```
