# Sprint 4.2E — Calendar Deterministic Generation Integration

Integração final: **todos** os pontos de entrada de "Gerar cobrança" utilizam `executeDeterministicGenerateRenewal()` em `src/lib/subscriptionBillingGeneration.ts`.

## Componentes auditados

| Componente | `cycle_id` | `componentName` (dev log) |
|------------|------------|---------------------------|
| `NextInvoiceCard` | ✓ `next.cycleId` | `NextInvoiceCard` |
| `FinancialHistoryRow` | ✓ `row.cycleId` | `FinancialHistoryRow` |
| `FinancialCalendarPopover` | ✓ `ev.cycleId` | `FinancialCalendarPopover` |
| `FinancialSummarySidebar` | ✓ `nextInvoice.cycleId` | `FinancialSummarySidebar` |
| `UpcomingPaymentsList` | ✓ por evento | `UpcomingPaymentsList` |
| `SubscriptionActionsPanel` | ✓ resolver oficial | `SubscriptionActionsPanel` |
| `SubscriptionRenewalActionsCard` | ✓ resolver oficial | `SubscriptionRenewalActionsCard` |

## Regras

- Nenhuma chamada direta a `generateRenewalNow(id)` sem passar pelo executor (exceto o próprio executor).
- Fallback oficial: target explícito → `resolveNextChargeCycleFromDetail` → `resolveEarliestUninvoicedCycleFromDetail`.
- **Nunca** `subscriptions.next_billing_date` para escolher competência.
- Dev: log `[BILLING_DETERMINISTIC_GENERATE]` com `component_name`, `cycle_id`, `payload`.

## Correção crítica (4.2D → 4.2E)

`SubscriptionDetail` envolvia `onGenerateBilling={() => handleGenerateBilling()}`, descartando o `cycleId` passado pelo `NextInvoiceCard`. Corrigido para `onGenerateBilling={handleGenerateBilling}`.

## Testes

- `src/lib/subscriptionBillingGeneration.test.ts`
