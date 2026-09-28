# Sprint 5.0-18 — NextInvoice Stage Migration

**Branch:** `feature/billing-next-invoice-stage`  
**Commit:** `feat(billing): implement NextInvoiceStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **NextInvoiceStage**, populando `aggregate.nextInvoice` exclusivamente a partir de `aggregate.events` — resolução determinística de qual FinancialEvent representa a próxima cobrança, sem recálculo de datas, cycles, subscription ou motor legado.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingNextInvoiceSnapshot` + `BillingNextInvoiceMetadata`; `nextInvoice` nullable |
| `src/lib/billingAggregate/nextInvoiceSnapshot.ts` | **Novo** — `resolveNextInvoiceFromEvents` |
| `src/lib/billingAggregate/BillingAggregate.ts` | Empty shell: `nextInvoice: null` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `nextInvoiceStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/nextInvoiceStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingNextInvoiceSnapshot`

```typescript
type BillingNextInvoiceSnapshot = {
  eventId: string;           // referência ao FinancialEvent
  cycleId: string;
  subscriptionId: string;
  eventType: BillingFinancialEventType;
  date: string;              // occurredAt do evento
  status: string;
  metadata: {
    invoiceId, jobId, periodStart, periodEnd,
    skippedReason, errorMessage, amount, currency
  };
};

// aggregate.nextInvoice: BillingNextInvoiceSnapshot | null
// null quando events está vazio — nunca cria eventos virtuais
```

## Pipeline atualizado

```
SubscriptionStage
  → CycleStage
  → FinancialEventStage
  → HistoryStage
  → CalendarStage
  → SidebarStage
  → NextInvoiceStage          ← 5.0-18
  → AlertStage (passthrough)
  → CapabilityStage (passthrough)
  → …
```

## Fluxo Events → NextInvoice

```
aggregate.events[]
  → resolveEarliestEvent (occurredAt asc, desempate por id)
  → map para BillingNextInvoiceSnapshot
  → aggregate.nextInvoice  (ou null se vazio)
```

- **Permitido:** `aggregate.events` apenas
- **Proibido:** `aggregate.subscription`, `aggregate.cycles`, `context.source`, timeline, builders legados

## Critério determinístico de seleção

1. Considerar **apenas** eventos em `aggregate.events`
2. Ordenação cronológica **crescente** por `occurredAt`
3. Empate resolvido por `id` (lexicográfico ascendente)
4. Selecionar o **primeiro** (mais antigo)
5. Mesmo Aggregate → sempre o mesmo `nextInvoice`
6. Sem eventos → `null` (sem eventos virtuais, sem projeção)

Nenhuma filtragem por status, elegibilidade ou Generate nesta sprint.

## Provas de independência do motor legado

Testes estáticos em `nextInvoiceStage.test.ts` verificam que `nextInvoiceSnapshot.ts` e `nextInvoiceStage`:

- Não importam `FinancialEventStore`, `subscriptionNextInvoiceResolver`, `resolveNextChargePresentation`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `nextInvoiceStage` usa apenas `aggregate.events`

## Invariantes arquiteturais

1. NextInvoice depende exclusivamente de `aggregate.events`
2. Nunca consulta Cycles
3. Nunca consulta Subscription
4. Nunca consulta Timeline
5. Nunca consulta Projection
6. Nunca consulta FinancialEventStore
7. Nunca cria novos eventos
8. Sempre referencia um FinancialEvent existente (quando não-null)

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — com eventos: `eventId` válido; sem eventos: `nextInvoice === null`.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement NextInvoiceStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- NextInvoice ainda **não possui Capabilities**
- NextInvoice ainda **não possui Generate**
- NextInvoice ainda **não possui ações**
- NextInvoice apenas referencia um evento existente
- Não filtra por status (ex.: paid vs pending) — lógica de permissão em sprints posteriores

## Próxima Sprint (5.0-19 AlertsStage)

Projetar `aggregate.alerts` a partir do Aggregate — ainda sem wire na UI.
