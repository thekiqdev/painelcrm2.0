# UI Component Dependency Matrix — Sprint 5.0-22A

Mapeamento de todos os componentes React do Billing e suas dependências de dados.

**Legenda:** 🟢 montado em `SubscriptionDetail` | 🟡 exportado, não montado | ⚫ legado/desmontado

---

## Matriz principal

| Componente | Status | Hook store | Métodos store | Helpers legados | Lê `detail`? | Lê timeline? |
|------------|--------|------------|---------------|-----------------|--------------|--------------|
| `FinancialEventStoreProvider` | 🟢 | — | cria store | `createBillingExperienceStore` | payload | via signature |
| `FinancialHeader` | 🟢 | — | — | `buildFinancialHeaderData` | sim | **sim (interno)** |
| `FinancialSmartScroll` | 🟢 | ✅ | `events`, `today` | `buildFinancialAlerts` | sim | **sim (interno)** |
| `RecurringRevenueCard` | 🟢 | ✅ | `getKpiCards`, `getUpcomingReceipts` | refinement | não | não |
| `NextInvoiceCard` | 🟢 | ✅ | (via helper) | `resolveNextChargePresentationFromStore` | status | **sim (interno)** |
| `FinancialCalendar` | 🟢 | ✅ | `today`, `getEventsForMonth`, `getEventsByDay`, `getCalendarEvents` | calendar grid helpers | default month | não |
| `FinancialSummarySidebar` | 🟢 | ✅ | `getSidebarSummary`, `events`, `today` | `buildFinancialAlerts`, `resolveNextChargePresentationFromStore` | sim | **sim (interno)** |
| `FinancialHistory` | 🟢 | ✅ | `filterHistory` | types/experience | não | não |
| `FinancialHistoryRow` | 🟢 | timezone | — | `subscriptionActionExperience`, `invoiceAvailableActions` | não | não |
| `HistoryRowChargeAction` | 🟢 | — | — | `subscriptionRenewalRecovery` | não | não |
| `InvoiceDirectActions` | 🟢 | — | — | `invoiceCapabilities` (indireto) | não | não |
| `InvoiceQuickActions` | 🟢 | — | — | `invoiceAvailableActions` | não | não |
| `InvoiceActionsMenu` | 🟢 | — | — | `invoiceQuickActions` | não | não |
| `FinancialCalendarPopover` | 🟢 | timezone | — | `isProjectedFinancialEvent`, `invoiceAvailableActions` | não | não |
| `FinancialInsights` | 🟢 | ✅ | `getInsights` | overview shell | não | não |
| `FinancialTechnicalAccordion` | 🟢 | ✅ | `events`, `events.length` | `buildTechnicalDiagnostics`, `buildWorkerHistoryEntries` | jobs, cycles_raw | não |
| `FinancialResolveDialog` | 🟢 | — | — | refinement | não | não |
| `LazyFinancialSection` | 🟢 | — | — | consistency defer | não | não |
| `ConfirmPaymentDialog` | 🟢 | — | — | billingSafeDate | não | não |
| `ProjectedCompetenceNotice` | 🟢 | — | — | `isProjectedFinancialEvent` | não | não |
| `FinancialAlertList` | 🟡 | ✅ | `today` | `buildFinancialAlerts` | sim | **sim (interno)** |
| `FinancialTimeline` | 🟡 | ✅ | `getTimelineMonthGroups`, `events`, `today` | timelineNavigation | não | não |
| `UpcomingPaymentCard` | 🟡 | ✅ | `getUpcomingReceipts` | — | não | não |
| `UpcomingPaymentsList` | 🟡 | ✅ | `getUpcomingReceipts`, `events`, **`detail`** | `cycleSupportsManualGenerate` | **sim** | não |
| `ForecastCard` | 🟡 | ✅ | `getMonthOverview` | — | não | **sim (interno)** |
| `FinancialUpcomingAgenda` | 🟡 | ✅ | `getUpcomingAgenda` | overview | não | não |
| `SubscriptionProgressBar` | 🟡 | — | — | experience | não | não |
| `SubscriptionDetail` (page) | 🟢 | provider | — | `executeDeterministicGenerateRenewal` | sim | não direto |
| `SubscriptionActionsPanel` | 🟢 | — | — | — | status | não |
| `SubscriptionSettingsActions` | 🟢 | — | — | — | sim | não |
| `SubscriptionRenewalActionsCard` | ⚫ órfão | — | — | `resolveFirstEligibleCycle`, generate API | sim | não |
| `SubscriptionFinancialHistory` | ⚫ | — | — | `buildFinancialHistoryRows` | sim | **sim** |
| `SubscriptionFinancialCalendar` | ⚫ | — | — | `collectEventsForMonth` | sim | **sim** |
| `SubscriptionBusinessTimeline` | ⚫ | — | — | `buildBusinessTimelineEvents` | sim | **sim** |
| `SubscriptionSituationCard` | ⚫ | — | — | situation resolver | sim | não |

---

## `useFinancialEventStore()` — arquivos consumidores

| Arquivo | Linha |
|---------|-------|
| `FinancialCalendar.tsx` | 53 |
| `FinancialHistory.tsx` | 42 |
| `FinancialInsights.tsx` | 11 |
| `FinancialSmartScroll.tsx` | 16 |
| `FinancialSummarySidebar.tsx` | 45 |
| `FinancialTechnicalAccordion.tsx` | 48 |
| `FinancialTimeline.tsx` | 118 |
| `FinancialUpcomingAgenda.tsx` | 12 |
| `FinancialAlert.tsx` | 18 |
| `ForecastCard.tsx` | 10 |
| `NextInvoiceCard.tsx` | 37 |
| `RecurringRevenueCard.tsx` | 19 |
| `UpcomingPaymentCard.tsx` | 21 |
| `UpcomingPaymentsList.tsx` | 130 |

**Total:** 14 componentes + 1 provider.

---

## Métodos do store utilizados pela UI

| Método / propriedade | Componentes |
|---------------------|-------------|
| `filterHistory` | FinancialHistory |
| `getCalendarEvents` | FinancialCalendar |
| `getEventsByDay` | FinancialCalendar |
| `getEventsForMonth` | FinancialCalendar |
| `getInsights` | FinancialInsights |
| `getKpiCards` | RecurringRevenueCard |
| `getMonthOverview` | ForecastCard (não montado) |
| `getSidebarSummary` | FinancialSummarySidebar |
| `getTimelineMonthGroups` | FinancialTimeline (não montado) |
| `getUpcomingAgenda` | FinancialUpcomingAgenda (não montado) |
| `getUpcomingReceipts` | RecurringRevenueCard, UpcomingPaymentCard, UpcomingPaymentsList |
| `events` | SmartScroll, Sidebar, TechnicalAccordion, Timeline, UpcomingPaymentsList |
| `today` | SmartScroll, Sidebar, Alert, Calendar, Timeline |
| `detail` | UpcomingPaymentsList **only** |

### Métodos disponíveis mas não chamados pela UI

`getHistoryRows`, `getTimelineItems`, `getNextAgendaEvent`, `getNextChargeEvent`, `getNextChargePresentation`, `getEventsForDay`, `getEventById`, `getEventsByType`, `getPaymentEventIds`, `realEvents`, `subscriptionId`, `builtAt`

---

## Botões de ação — origem da lógica

| Ação | Componentes | Fonte de decisão |
|------|-------------|------------------|
| **Gerar cobrança** | NextInvoiceCard, HistoryRowChargeAction, Sidebar alert, InvoiceDirectActions, ActionsPanel FAB | `canGenerateNow` / `resolveInvoiceCapabilities` / page handler |
| **Reprocessar** | InvoiceDirectActions, InvoiceQuickActions | `invoiceCapabilities.supportsResolve` |
| **Cancelar assinatura** | ActionsPanel, SettingsActions | permissões + `crmSubscriptionsService.cancel` |
| **Confirmar pagamento** | ConfirmPaymentDialog | invoice actions |
| **Abrir fatura** | InvoiceDirectActions | `invoiceCapabilities.supportsOpen` |

Todos os botões de invoice passam por **`invoiceCapabilities.ts`** (legado), alimentado por tipos de evento adaptados — **não** por `aggregate.capabilities`.

---

## Hooks relacionados (mesmo context)

| Hook | Consumidores |
|------|--------------|
| `useFinancialTimeZone` | TechnicalAccordion, HistoryRow, InvoiceActionsMenu, CalendarPopover |
| `usePaymentConfirmedHandler` | idem |
| `useOptionalFinancialEventStore` | **nenhum** — definido, não usado |
