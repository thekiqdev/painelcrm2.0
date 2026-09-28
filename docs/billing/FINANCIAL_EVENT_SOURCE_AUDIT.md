# Financial Event Source Audit — Sprint 4.1L

## Fontes antes da unificação

| Componente | Origem anterior | Problema |
|------------|-----------------|----------|
| FinancialCalendar | `FinancialEventStore.events` | ✓ Correto |
| FinancialHistory | `detail.timeline` via `buildFinancialHistoryRows` | ✗ Sem previstas |
| NextInvoiceCard | `subscriptionNextInvoiceResolver` | ✗ Lógica paralela |
| FinancialSummarySidebar | `resolveNextInvoiceExperience` | ✗ Lógica paralela |
| FinancialInsights | `FinancialEventStore` | ✓ Correto |
| KPIs | `FinancialEventStore` | ✓ Correto |

## Duplicações removidas

- `buildFinancialHistoryRows` → delega a `FinancialEventStore.getHistoryRows()`
- `resolveNextInvoiceExperience` → delega a `subscriptionFinancialEvents`
- `NextInvoiceCard` / `Sidebar` → `resolveNextChargePresentationFromStore()`

## Fonte única (após 4.1L)

`buildSubscriptionFinancialEvents()` → `subscriptionFinancialEventBuilder.buildFinancialEvents()`

_Sprint 4.1L_
