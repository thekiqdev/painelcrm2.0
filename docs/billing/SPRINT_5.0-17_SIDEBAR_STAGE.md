# Sprint 5.0-17 — Sidebar Stage Migration

**Branch:** `feature/billing-sidebar-stage`  
**Commit:** `feat(billing): implement SidebarStage on Billing Aggregate`  
**Status:** Concluída

## Objetivo

Implementar a **SidebarStage**, populando `aggregate.sidebar` exclusivamente a partir de `aggregate.subscription` e `aggregate.events` — resumo determinístico do Aggregate, sem cycles, timeline, projeções ou motor legado.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/billingAggregate/types.ts` | `BillingSidebarSnapshot` + `BillingSidebarMetadata` |
| `src/lib/billingAggregate/sidebarSnapshot.ts` | **Novo** — `buildSidebarFromAggregate` |
| `src/lib/billingAggregate/BillingAggregate.ts` | Empty shell alinhado ao novo tipo |
| `src/lib/billingAggregate/BillingAggregateBuilder.ts` | `sidebarStage` implementada |
| `src/lib/billingAggregate/index.ts` | Exports públicos |
| `tests/billing/aggregate/sidebarStage.test.ts` | **Novo** — testes + prova de independência |
| Testes aggregate existentes | Expectativas atualizadas |

## Estrutura do `BillingSidebarSnapshot`

```typescript
type BillingSidebarSnapshot = {
  subscriptionStatus: string;
  subscriptionType: string;
  billingInterval: string;
  currency: string;
  amount: number;
  eventCount: number;
  lastEventDate: string | null;   // occurredAt do evento mais recente
  lastEventType: BillingFinancialEventType | null;
  metadata: {
    subscriptionId, tenantId, customerId,
    cancelAtPeriodEnd, nextBillingDate,
    currentPeriodStart, currentPeriodEnd
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
  → SidebarStage              ← 5.0-17
  → NextInvoiceStage (passthrough)
  → AlertStage (passthrough)
  → CapabilityStage (passthrough)
  → …
```

## Fluxo Subscription + Events → Sidebar

```
aggregate.subscription  ──┐
                          ├──► buildSidebarFromAggregate()
aggregate.events        ──┘         │
                                    ▼
                          aggregate.sidebar
```

- **Permitido:** `aggregate.subscription`, `aggregate.events`
- **Proibido:** `aggregate.cycles`, `context.source`, timeline, builders legados

`lastEventDate` / `lastEventType` = evento com maior `occurredAt` (desempate por `id`). Sem eventos → ambos `null`.

## Responsabilidades da Sidebar

| Incluído nesta sprint | Fora de escopo |
|-----------------------|----------------|
| Resumo da assinatura (status, tipo, intervalo, valor) | Alerts |
| Contagem de eventos | NextInvoice |
| Último evento (data + tipo) | Capabilities |
| Metadados de identidade/período | Projeções UX |

## Provas de independência do motor legado

Testes estáticos em `sidebarStage.test.ts` verificam que `sidebarSnapshot.ts` e `sidebarStage`:

- Não importam `FinancialEventStore`, `subscriptionFinancialExperience`, `billingSubscriptionExperience`, `billingStateMachine`, etc.
- Não referenciam `detail.timeline`, `cycles_raw` ou `context.source`
- `sidebarStage` usa apenas `aggregate.subscription` e `aggregate.events`

## Invariantes arquiteturais

1. Sidebar depende apenas de Subscription e Events
2. Sidebar nunca consulta Cycles
3. Sidebar nunca consulta Timeline
4. Sidebar nunca consulta Projection
5. Sidebar nunca consulta o FinancialEventStore
6. Sidebar representa apenas um resumo do Aggregate

## Testes executados

```bash
npm run test:billing   # verde
```

### Golden Dataset

42 cenários — `sidebar.eventCount === events.length`; status/amount alinhados à subscription.

### Certification Suite

168 testes + snapshots visuais — **verde** (UI legada inalterada).

### Regression Suite

4.2K–4.2Q — **verde**.

## Rollback

Reverter commit `feat(billing): implement SidebarStage on Billing Aggregate`. UI continua no `FinancialEventStore`.

## Limitações conhecidas

- Sidebar ainda **não possui Alerts**
- Sidebar ainda **não possui Capabilities**
- Sidebar ainda **não possui NextInvoice**
- Sidebar **não calcula projeções**
- Sidebar representa apenas um resumo determinístico do Aggregate

## Próxima Sprint (5.0-18 NextInvoiceStage)

Projetar `aggregate.nextInvoice` a partir de subscription + events — ainda sem wire na UI.
