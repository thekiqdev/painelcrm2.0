# Sprint 5.0-23A — SubscriptionCycle Materialization Migration Report

**Data:** 2026-07-06  
**Status:** IMPLEMENTED  
**ADR:** [ADR-002 — ACCEPTED](./ADR-002_SUBSCRIPTION_CYCLE_MATERIALIZATION_POLICY.md)

---

## Objetivo

Centralizar permanentemente toda **criação inicial** de `subscription_cycles` em um único serviço de domínio, preservando o comportamento do Billing Engine.

---

## Novos módulos

| Módulo | Arquivo | Responsabilidade |
|--------|---------|------------------|
| **SubscriptionCyclePlanner** | `packages/backend/src/services/subscriptionCyclePlanner.ts` | Decide quais competências materializar (read-only) |
| **SubscriptionCycleMaterializer** | `packages/backend/src/services/subscriptionCycleMaterializer.ts` | `ensureSubscriptionCycle()` — INSERT idempotente; `updateSubscriptionCycleLifecycle()` — UPDATE worker |

---

## Pontos migrados

| Caller | Antes | Depois |
|--------|-------|--------|
| Scheduler `enqueueRenewalJobs` | `subscriptionCyclesUpsertAfterScheduler` via `insertOrReactivateRenewalJob` | `planSchedulerEligibleCycle` → `materializePlannedCycles` → job enqueue |
| `insertOrReactivateRenewalJob` | INSERT inline em `subscriptionCyclesUpsertAfterScheduler` | Planner + Materializer no início; wrapper `subscriptionCyclesUpsertAfterScheduler` com `jobId` |
| `tryEnqueueRenewalJobForSubscriptionId` | Ciclo só via `insertOrReactivateRenewalJob` | `planSchedulerEligibleCycle` → `materializePlannedCycles` antes do job |
| Manual Generate `ensureJobForManualGenerate` | Ciclo via `insertOrReactivateRenewalJob` | `planManualGenerateCycles` → `materializePlannedCycles` |
| Manual pós-sucesso (22E) | `tryEnqueueRenewalJobForSubscriptionId` | Inalterado na superfície; materialização via cadeia tryEnqueue → insertOrReactivate |
| PATCH `next_billing_date` | tryEnqueue only | `planPatchNextBilling` → `materializePlannedCycles` → tryEnqueue |
| Resume / Reactivate | tryEnqueue only | `planResumeCycle` → `materializePlannedCycles` → tryEnqueue |
| Worker dual-write (`markProcessing`, `onJobCompleted`, etc.) | `upsertCycleRow` INSERT ON CONFLICT | `updateSubscriptionCycleLifecycle` (ensure + UPDATE) |
| `subscriptionCyclesUpsertAfterScheduler` | INSERT SQL local | **Wrapper** → `ensureSubscriptionCycle` |

---

## INSERT ownership (grep gate)

Único `INSERT INTO subscription_cycles` no código de produção:

```
packages/backend/src/services/subscriptionCycleMaterializer.ts
  └── ensureSubscriptionCycle()
```

Migrations SQL legadas (ex.: 141) permanecem históricas — fora do runtime.

---

## Mapa de ownership do domínio

```
SubscriptionCyclePlanner          → QUANDO / QUAIS competências (sem I/O)
SubscriptionCycleMaterializer     → GARANTIR row (INSERT inicial + bootstrap worker)
subscriptionCyclesDualWriteService  → Worker lifecycle UPDATE (delega Materializer)
recurringBillingJobService        → Jobs (enqueue); chama Planner → Materializer
billingManualRenewalService       → Manual pipeline; Planner no ensure job
customerInvoiceRecurrenceNextBillingService → PATCH datas; Planner antes enqueue
crmSubscriptionsLifecycleService  → Resume/Reactivate; Planner antes enqueue
subscriptionCycleRepairService    → UPDATE failed→pending (sem INSERT)
billingRuntimeValidator           → READ_ONLY — reporta; **não** materializa
```

---

## Comportamento preservado

- BillingAggregate, FinancialEventStore, React UI: **sem alteração**
- Scheduler janela `generation_date` + horário local: **inalterado**
- Worker, gateway, notificações, timeline: **inalterados**
- Runtime validator: **READ_ONLY** (repair service mantém UPDATE-only; decisão de materializar nos callers operacionais)

---

## Testes

- `packages/backend/src/services/subscriptionCycleMaterializer.test.ts` (novo)
- Suíte existente: `npm run test:billing` + vitest backend
