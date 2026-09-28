# Sprint 5.0-15 — History Stage Migration

**Branch:** `feature/billing-history-stage`  
**Commit:** `feat(billing): implement HistoryStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **HistoryStage**, populando `aggregate.history` exclusivamente a partir de `aggregate.events` — projeção pura, sem cycles, timeline, contexto original ou motor legado.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingHistorySnapshot` + `BillingHistoryRowMetadata` |
| `src/lib/billingAggregate/historySnapshot.ts` | **Novo** — `mapEventToHistoryRow`, `buildHistoryFromEvents` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `historyStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/historyStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingHistoryRow`

```typescript
type BillingHistorySnapshot = {
  id: string;              // history-{eventId}
  eventId: string;         // referência ao FinancialEvent
  cycleId: string;
  subscriptionId: string;
  type: BillingFinancialEventType;
  status: string;          // cópia literal do evento
  date: string;            // occurredAt do evento
  title: string;           // label estático por eventType
  metadata: {
    invoiceId, jobId, periodStart, periodEnd,
    skippedReason, errorMessage, amount, currency, eventType
  };
};
```

## Pipeline atualizado

```
SubscriptionStage
  → CycleStage
  → FinancialEventStage
  → HistoryStage              ← 5.0-15
  → CalendarStage (passthrough)
  → SidebarStage (passthrough)
  → NextInvoiceStage (passthrough)
  → …
```

## Fluxo Events → History

```
aggregate.events[]
  → sort by occurredAt asc (desempate por id)
  → mapEventToHistoryRow (1:1)
  → aggregate.history[]
```

- **Permitido:** `aggregate.events` apenas
- **Proibido:** `aggregate.subscription`, `aggregate.cycles`, `context.source`, timeline, builders legados

## Provas de independência do motor legado

Testes estáticos em `historyStage.test.ts` verificam que `historySnapshot.ts` e `historyStage`:

- Não importam `FinancialEventStore`, `subscriptionFinancialEvents`, `billingStateMachine`, `resolveHistoryRowState`, `cycleSupportsManualGenerate`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `historyStage` usa apenas `aggregate.events`

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `history.length === events.length`; cada `eventId` referencia um evento existente.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement HistoryStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- History em modo **1 evento = 1 linha**
- Nenhuma consolidação de eventos
- Nenhuma deduplicação inteligente
- Nenhuma regra de elegibilidade
- Nenhuma lógica de Generate (`canGenerate` ausente nesta sprint)
- Essas responsabilidades serão introduzidas em sprints posteriores

## Próxima Sprint (5.0-16 CalendarStage)

Projetar `aggregate.calendar` a partir de `aggregate.events` — ainda sem wire na UI.
