# Sprint 5.0-14 — Financial Event Stage Migration

**Branch:** `feature/billing-financial-events`  
**Commit:** `feat(billing): implement FinancialEventStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **FinancialEventStage**, populando `aggregate.events` exclusivamente a partir de `aggregate.subscription` e `aggregate.cycles`, sem timeline, operational_state, projeções ou motor legado.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingFinancialEventSnapshot` + tipos independentes |
| `src/lib/billingAggregate/financialEventSnapshot.ts` | **Novo** — mapper aggregate → events |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `financialEventStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/financialEventStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingFinancialEvent`

```typescript
type BillingFinancialEventSnapshot = {
  id: string;                    // billing-event-{cycleId}
  cycleId: string;               // obrigatório (1 evento por ciclo)
  subscriptionId: string;
  eventType: BillingFinancialEventType;
  occurredAt: string;            // processedAt ?? cycleDate
  status: string;                // cópia literal de cycle.status
  metadata: {
    invoiceId, jobId, periodStart, periodEnd,
    skippedReason, errorMessage, amount, currency, cycleMetadata
  };
};
```

### Normalização `status` → `eventType`

| `cycle.status` | `eventType` |
|----------------|-------------|
| `pending` | `cycle_pending` |
| `queued` | `cycle_queued` |
| `processing` | `cycle_processing` |
| `generated` / `invoiced` | `invoice_generated` |
| `paid` | `payment` |
| `failed` | `invoice_failed` |
| `cancelled` | `cycle_cancelled` |
| `skipped` | `cycle_skipped` |
| outro | `cycle_unknown` |

## Pipeline atualizado

```
SubscriptionStage → CycleStage → FinancialEventStage → HistoryStage (passthrough) → …
```

## Origem dos eventos

- **Permitido:** `aggregate.subscription` (amount, currency em metadata), `aggregate.cycles`
- **Proibido:** `detail.timeline`, `cycles_raw` direto na stage, builders legados, projeções

Regra: **1 evento real por ciclo**, ordem preservada, IDs únicos.

## Provas de independência do motor legado

Testes estáticos em `financialEventStage.test.ts` verificam que `financialEventSnapshot.ts` e `financialEventStage`:

- Não importam `subscriptionFinancialEventBuilder`, `FinancialEventStore`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline` nem `operational_state`
- `financialEventStage` usa apenas `aggregate.subscription` e `aggregate.cycles` (não `context.source`)

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `events.length === cycles.length`; `cycleId` sempre presente quando há ciclos.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement FinancialEventStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Próxima Sprint (5.0-15 HistoryStage)

Projetar `aggregate.history` a partir de `aggregate.events` — ainda sem wire na UI.
