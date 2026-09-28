# Sprint 5.0-13 — Cycle Stage Migration

**Branch:** `feature/billing-cycle-stage`  
**Commit:** `feat(billing): implement CycleStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar exclusivamente a **CycleStage**, migrando `BillingContext.source.cycles_raw` → `BillingAggregate.cycles` via mapper 1:1, sem timeline, projeções, elegibilidade ou FinancialEvents.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingCycleSnapshot` em camelCase + `metadata` |
| `src/lib/billingAggregate/cycleSnapshot.ts` | **Novo** — `mapCycleSnapshot`, `mapCyclesFromSource` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `cycleStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/cycleStage.test.ts` | **Novo** — testes da stage |
| `tests/billing/aggregate/aggregateFactory.test.ts` | Expectativas atualizadas |
| `tests/billing/aggregate/aggregateStages.test.ts` | Expectativas atualizadas |
| `tests/billing/aggregate/aggregateHarness.test.ts` | Paridade `cycles_raw` em 40 cenários |

## Campos migrados

| `cycles_raw` | `BillingCycleSnapshot` |
|--------------|------------------------|
| `id` | `id` |
| `subscription_id` (se presente) | `subscriptionId` |
| — | `subscriptionId` ← `context.source.subscription.id` quando ausente no row |
| `cycle_date` | `cycleDate` |
| `period_start` | `periodStart` |
| `period_end` | `periodEnd` |
| `status` | `status` (literal) |
| `invoice_id` | `invoiceId` |
| `job_id` | `jobId` |
| `processed_at` | `processedAt` |
| `skipped_reason` | `skippedReason` |
| `error_message` | `errorMessage` |
| demais chaves | `metadata` |

## Estrutura do `BillingCycleSnapshot`

```typescript
type BillingCycleSnapshot = {
  id: string;
  subscriptionId: string;
  cycleDate: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  invoiceId: string | null;
  jobId: string | null;
  processedAt: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};
```

## Pipeline atualizado

```
BillingContext
  → SubscriptionStage (subscription)
  → CycleStage (cycles)          ← 5.0-13
  → TimelineStage … TechnicalStage (passthrough)
```

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `aggregate.cycles.length === cycles_raw.length`, IDs e status idênticos.

### Certification Suite

168 testes + snapshots visuais — **verde**, sem alteração (UI legada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement CycleStage on Billing Aggregate`. UI não consome o aggregate.

## Próxima Sprint (5.0-14 FinancialEventStage)

Popular `aggregate.events` a partir do aggregate (subscription + cycles) via pipeline canônico de eventos — ainda sem wire na UI.
