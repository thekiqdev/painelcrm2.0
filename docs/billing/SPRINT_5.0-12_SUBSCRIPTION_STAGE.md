# Sprint 5.0-12 — Subscription Stage Migration

**Branch:** `feature/billing-subscription-stage`  
**Commit:** `feat(billing): implement SubscriptionStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar exclusivamente a **SubscriptionStage** do Billing Aggregate, populando `aggregate.subscription` com cópia normalizada de `context.source.subscription`, sem migrar cycles, events, views ou regras de negócio.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingSubscriptionSnapshot` expandido (21 campos + `metadata`) |
| `src/lib/billingAggregate/subscriptionSnapshot.ts` | **Novo** — `mapSubscriptionSnapshot` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `subscriptionStage` implementada |
| `src/lib/billingAggregate/BillingAggregate.ts` | Empty shell alinhado ao novo tipo |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/subscriptionStage.test.ts` | **Novo** — testes da stage |
| `tests/billing/aggregate/aggregateFactory.test.ts` | Expectativas atualizadas |
| `tests/billing/aggregate/aggregateStages.test.ts` | Expectativas atualizadas |
| `tests/billing/aggregate/aggregateHarness.test.ts` | Expectativas atualizadas |

## Campos migrados (`aggregate.subscription`)

| Campo | Origem (`subscription.*`) |
|-------|---------------------------|
| `id` | `id` |
| `tenantId` | `tenant_id` |
| `customerId` | `customer_id` |
| `status` | `status` (cópia literal) |
| `subscriptionType` | `type` |
| `billingInterval` | `billing_interval` |
| `billingIntervalCount` | `billing_cycle_count` |
| `currency` | `currency` |
| `amount` | `amount_cents` |
| `nextBillingDate` | `next_billing_date` |
| `currentPeriodStart` | `current_period_start` |
| `currentPeriodEnd` | `current_period_end` |
| `billingAnchorDay` | `billing_anchor_day` |
| `cancelAtPeriodEnd` | `cancel_at_period_end` |
| `cancelledAt` | `cancelled_at` (se presente; senão `null`) |
| `pausedAt` | `paused_at` (se presente; senão `null`) |
| `reactivatedAt` | `reactivated_at` (se presente; senão `null`) |
| `trialEndsAt` | `trial_ends_at` (se presente; senão `null`) |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `metadata` | `plan_id`, `gateway`, `grace_period_days`, etc. |

## Campos ainda não migrados

- `cycles`, `invoices`, `timeline`
- `events`, `history`, `calendar`
- `sidebar`, `nextInvoice`, `alerts`
- `capabilities`, `technical`

## Pipeline atualizado

```
BillingContext
  → validate
  → createEmptyBillingAggregate (subscription shell)
  → SubscriptionStage  ← popula subscription
  → CycleStage … TechnicalStage (passthrough)
  → BillingAggregate
```

## Impacto

- **UI:** nenhum — `FinancialEventStore` permanece a única fonte em produção.
- **API / Backend / Worker / Scheduler:** nenhum.
- **Comportamento visual:** inalterado — Certification snapshots idênticos.

## Testes executados

```bash
npm run test:billing   # 268 passed
```

### Golden Dataset

42 cenários — harness verde; `aggregate.subscription` populado em todos.

### Certification Suite

168 testes + snapshots — **verde**, sem regeneração.

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement SubscriptionStage on Billing Aggregate`. A UI não depende do novo aggregate.

## Próxima Sprint (5.0-13 CycleStage)

Popular `aggregate.cycles` a partir de `context.source.cycles_raw` com cópia normalizada — sem regras de elegibilidade ou projeção.
