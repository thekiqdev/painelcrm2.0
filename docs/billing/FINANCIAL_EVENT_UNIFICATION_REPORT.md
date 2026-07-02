# Financial Event Unification Report — Sprint 4.1L

## Módulo canônico

`src/lib/subscriptionFinancialEvents.ts`

## API

| Função | Uso |
|--------|-----|
| `buildSubscriptionFinancialEvents()` | Constrói coleção única |
| `resolveNextChargeEvent()` | Primeira competência prevista |
| `resolveNextChargePresentation()` | Card / Sidebar |
| `financialEventToHistoryRow()` | Histórico unificado |

## Provider

`FinancialEventStoreProvider` → `createFinancialEventStore(detail)` → todos os filhos.

## Componentes unificados

- ✓ FinancialCalendar
- ✓ FinancialHistory
- ✓ NextInvoiceCard
- ✓ FinancialSummarySidebar
- ✓ FinancialInsights
- ✓ RecurringRevenueCard (KPIs)

_Sprint 4.1L_
