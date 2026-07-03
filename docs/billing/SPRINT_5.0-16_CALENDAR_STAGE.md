# Sprint 5.0-16 — Calendar Stage Migration

**Branch:** `feature/billing-calendar-stage`  
**Commit:** `feat(billing): implement CalendarStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **CalendarStage**, populando `aggregate.calendar` exclusivamente a partir de `aggregate.events` — projeção pura, paralela ao History, sem cycles, timeline, projeções UX ou motor legado.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingCalendarSnapshot` + `BillingCalendarEntryMetadata` |
| `src/lib/billingAggregate/calendarSnapshot.ts` | **Novo** — `mapEventToCalendarEntry`, `buildCalendarFromEvents` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `calendarStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/calendarStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingCalendarEntry`

```typescript
type BillingCalendarSnapshot = {
  id: string;              // calendar-{eventId}
  eventId: string;         // referência ao FinancialEvent
  cycleId: string;
  subscriptionId: string;
  date: string;            // occurredAt do evento
  eventType: BillingFinancialEventType;
  status: string;          // cópia literal do evento
  metadata: {
    invoiceId, jobId, periodStart, periodEnd,
    skippedReason, errorMessage, amount, currency
  };
};
```

## Pipeline atualizado

```
SubscriptionStage
  → CycleStage
  → FinancialEventStage
  → HistoryStage
  → CalendarStage              ← 5.0-16
  → SidebarStage (passthrough)
  → NextInvoiceStage (passthrough)
  → AlertStage (passthrough)
  → CapabilityStage (passthrough)
  → …
```

## Fluxo Events → Calendar

```
aggregate.events[]
  → sort by occurredAt asc (desempate por id)
  → mapEventToCalendarEntry (1:1)
  → aggregate.calendar[]
```

- **Permitido:** `aggregate.events` apenas
- **Proibido:** `aggregate.subscription`, `aggregate.cycles`, `context.source`, timeline, builders legados

## Comparação History × Calendar

| Aspecto | History | Calendar |
|---------|---------|----------|
| Fonte | `aggregate.events` | `aggregate.events` |
| Cardinalidade | 1 evento = 1 linha | 1 evento = 1 entrada |
| Ordenação | `occurredAt` asc + `id` | `occurredAt` asc + `id` |
| Prefixo de id | `history-{eventId}` | `calendar-{eventId}` |
| Campos extras | `title` (label estático) | — |
| Generate / capabilities | Não | Não |
| Projeções UX | Não | Não |

Ambos são **projeções paralelas** da mesma coleção — nenhum consulta cycles ou timeline.

## Provas de independência do motor legado

Testes estáticos em `calendarStage.test.ts` verificam que `calendarSnapshot.ts` e `calendarStage`:

- Não importam `FinancialEventStore`, `subscriptionFinancialProjection`, `resolveInvoiceCapabilities`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `calendarStage` usa apenas `aggregate.events`

## Invariantes arquiteturais

1. History e Calendar consomem exatamente a mesma coleção `aggregate.events`
2. Nenhum evento no Calendar sem existir em `aggregate.events`
3. Nenhum evento no History sem existir em `aggregate.events`
4. Calendar nunca consulta cycles diretamente
5. History nunca consulta cycles diretamente
6. Calendar e History são projeções paralelas do mesmo Aggregate

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `calendar.length === history.length === events.length`; cada `eventId` referencia um evento existente.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement CalendarStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- Calendar ainda **não possui projeções** UX
- Calendar ainda **não possui capabilities**
- Calendar ainda **não possui Generate**
- Calendar ainda **não possui agrupamentos**
- Calendar representa apenas eventos reais do Aggregate
- Projeções serão tratadas posteriormente como camada independente

## Próxima Sprint (5.0-17 SidebarStage)

Projetar `aggregate.sidebar` a partir de `aggregate.events` (e eventualmente subscription) — ainda sem wire na UI.
