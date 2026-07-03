# Sprint 5.0-20 — Capabilities Stage Migration

**Branch:** `feature/billing-capabilities-stage`  
**Commit:** `feat(billing): implement CapabilitiesStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **CapabilitiesStage**, populando `aggregate.capabilities` como estrutura centralizada e determinística de permissões do Billing Aggregate — sem motor legado, sem UI e sem Cutover.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingCapabilitySnapshot` expandido + metadata |
| `src/lib/billingAggregate/capabilitiesSnapshot.ts` | **Novo** — `buildCapabilitiesFromAggregate` |
| `src/lib/billingAggregate/BillingAggregate.ts` | Empty shell alinhado ao novo tipo |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `capabilityStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/capabilitiesStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingCapabilitiesSnapshot`

```typescript
type BillingCapabilitySnapshot = {
  canGenerate: boolean;
  canRetry: boolean;
  canCancel: boolean;
  canRefund: boolean;
  canPause: boolean;
  canResume: boolean;
  canReactivate: boolean;
  canDeleteInvoice: boolean;
  canOpenInvoice: boolean;
  canOpenSubscription: boolean;
  metadata: {
    subscriptionId, subscriptionStatus,
    cycleCount, eventCount, historyCount, calendarCount, alertCount,
    hasNextInvoice, failedEventCount, paymentEventCount, eventsWithInvoiceCount
  };
};
```

## Pipeline atualizado (completo)

```
SubscriptionStage
  → CycleStage
  → FinancialEventStage
  → HistoryStage
  → CalendarStage
  → SidebarStage
  → NextInvoiceStage
  → AlertsStage
  → CapabilitiesStage         ← 5.0-20 (última stage de negócio)
  → TechnicalStage (passthrough)
```

## Fluxo Aggregate → Capabilities

```
subscription, cycles, events,
history, calendar, sidebar,
nextInvoice, alerts
        │
        ▼
buildCapabilitiesFromAggregate()
        │
        ▼
aggregate.capabilities
```

### Flags determinísticas (resumo)

| Flag | Condição (somente Aggregate) |
|------|------------------------------|
| `canGenerate` | `status === 'active'` e evento generatable sem invoice |
| `canRetry` | active + evento `invoice_failed` |
| `canCancel` | active + há events |
| `canRefund` | há evento `payment` |
| `canPause` | `status === 'active'` |
| `canResume` | `status === 'paused'` |
| `canReactivate` | `cancelled` ou `expired` |
| `canDeleteInvoice` | algum evento com `invoiceId` |
| `canOpenInvoice` | algum invoiceId em events ou nextInvoice |
| `canOpenSubscription` | `subscription.id` presente |

Eventos generatable: `cycle_pending`, `cycle_queued`, `invoice_failed`, `cycle_skipped` sem `invoiceId`.

## Provas de independência do motor legado

Testes estáticos em `capabilitiesStage.test.ts` verificam que `capabilitiesSnapshot.ts` e `capabilityStage`:

- Não importam `FinancialEventStore`, `resolveInvoiceCapabilities`, `cycleSupportsManualGenerate`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `capabilityStage` usa apenas campos do Aggregate

## Invariantes arquiteturais

1. Capabilities dependem apenas do Aggregate
2. Capabilities nunca consultam Timeline
3. Capabilities nunca consultam `context.source`
4. Capabilities nunca consultam `cycles_raw`
5. Capabilities nunca consultam Projection
6. Capabilities nunca consultam FinancialEventStore
7. Mesmo Aggregate produz exatamente as mesmas Capabilities

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `capabilities` presente e estável; metadata alinhada às contagens do Aggregate.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement CapabilitiesStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- Capabilities **ainda não são consumidas pela UI**
- Nenhum componente React deve utilizar `aggregate.capabilities` nesta sprint
- Nenhuma alteração visual é permitida
- Flags são determinísticas do Aggregate — **não** garantem paridade com o motor legado até o Shadow Mode

## Aggregate completamente populado

Ao final desta sprint, o pipeline preenche:

| Campo | Sprint |
|-------|--------|
| `subscription` | 5.0-12 |
| `cycles` | 5.0-13 |
| `events` | 5.0-14 |
| `history` | 5.0-15 |
| `calendar` | 5.0-16 |
| `sidebar` | 5.0-17 |
| `nextInvoice` | 5.0-18 |
| `alerts` | 5.0-19 |
| `capabilities` | 5.0-20 |

## Preparação para Shadow Mode (5.0-21)

O Aggregate está estruturalmente completo e isolado do motor legado. A sprint **5.0-21 Shadow Mode** deve:

1. Executar Aggregate e `FinancialEventStore` em paralelo
2. Comparar equivalência (events, history, calendar, nextInvoice, alerts, capabilities)
3. Manter UI no motor legado até certificação 100%
4. Não fazer cutover nesta fase
