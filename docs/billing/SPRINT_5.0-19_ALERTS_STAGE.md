# Sprint 5.0-19 — Alerts Stage Migration

**Branch:** `feature/billing-alerts-stage`  
**Commit:** `feat(billing): implement AlertsStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **AlertsStage**, populando `aggregate.alerts` como coleção determinística derivada de `aggregate.subscription`, `aggregate.events` e `aggregate.nextInvoice` — sem motor legado, ações, capabilities ou Generate.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingAlertSnapshot` expandido + kinds/severity |
| `src/lib/billingAggregate/alertsSnapshot.ts` | **Novo** — `buildAlertsFromAggregate` |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `alertStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/alertsStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingAlertSnapshot`

```typescript
type BillingAlertSnapshot = {
  id: string;
  kind: BillingAlertKind;       // no_events | subscription_status | invoice_failed | cycle_cancelled | next_invoice
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  eventId: string | null;       // null para alertas de assinatura
  metadata: {
    subscriptionId, subscriptionStatus,
    eventType, eventStatus, nextInvoiceEventId
  };
};
```

## Pipeline atualizado

```
SubscriptionStage
  → CycleStage
  → FinancialEventStage
  → HistoryStage
  → CalendarStage
  → SidebarStage
  → NextInvoiceStage
  → AlertsStage               ← 5.0-19
  → CapabilitiesStage (passthrough)
  → …
```

## Fluxo Aggregate → Alerts

```
aggregate.subscription  ──┐
aggregate.events        ──┼──► buildAlertsFromAggregate()
aggregate.nextInvoice   ──┘         │
                                    ▼
                          aggregate.alerts[] (ordenado por id)
```

### Regras determinísticas (resumo)

| Condição | kind | severity |
|----------|------|----------|
| `subscription.status === 'paused'` | `subscription_status` | warning |
| `status ∈ {cancelled, expired}` | `subscription_status` | warning |
| `events.length === 0` | `no_events` | info |
| `event.eventType === 'invoice_failed'` | `invoice_failed` | error |
| `event.eventType === 'cycle_cancelled'` | `cycle_cancelled` | warning |
| `nextInvoice !== null` | `next_invoice` | info |

## Provas de independência do motor legado

Testes estáticos em `alertsStage.test.ts` verificam que `alertsSnapshot.ts` e `alertStage`:

- Não importam `FinancialEventStore`, `subscriptionFinancialExperience`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `alertStage` usa apenas `aggregate.subscription`, `aggregate.events` e `aggregate.nextInvoice`

## Invariantes arquiteturais

1. Alerts dependem apenas do Aggregate
2. Nenhum alerta consulta Timeline
3. Nenhum alerta consulta Cycles diretamente
4. Nenhum alerta consulta Projection
5. Nenhum alerta consulta FinancialEventStore
6. Mesmo Aggregate produz exatamente os mesmos Alerts

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `alerts` estável e determinístico; `eventId` válido quando presente.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement AlertsStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- Alerts ainda **não executam ações**
- Alerts ainda **não possuem Capabilities**
- Alerts ainda **não controlam Generate**
- Alerts são apenas projeções determinísticas do Aggregate

## Próxima Sprint (5.0-20 CapabilitiesStage)

Projetar `aggregate.capabilities` a partir do Aggregate — ainda sem wire na UI.
