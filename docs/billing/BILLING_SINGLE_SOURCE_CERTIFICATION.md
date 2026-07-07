# BILLING_SINGLE_SOURCE_CERTIFICATION — Sprint 4.2G

**Status:** CERTIFIED  
**Date:** 2026-07-02  
**Scope:** Frontend financial UI only (no Billing Engine / Worker / Scheduler / Gateway / DB changes)

## Objective

Prove that `subscription_cycles` (`cycles_raw` in the API payload) is the **only** source of truth for Calendar, History, Sidebar, Next Invoice, and manual generation.

## Certification checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `buildFutureCycles()` removed from financial event pipeline | ✅ | `subscriptionFinancialEventBuilder.ts` iterates only `listCyclesFromDetail()` |
| No `buildFutureCycles` in `src/components/subscriptions/financial/**` | ✅ | Grep: zero matches |
| `FinancialEventStore` built from `buildFinancialEvents` (cycles only) | ✅ | `subscriptionFinancialEventStore.ts` |
| Calendar / History / Sidebar consume `FinancialEventStore` | ✅ | `FinancialCalendar`, `FinancialHistory`, `FinancialSummarySidebar` |
| Next Invoice uses `resolveFirstEligibleCycle` | ✅ | `subscriptionNextInvoiceResolver.ts`, `subscriptionFinancialEvents.ts` |
| Manual generation requires `cycle_id` | ✅ | `executeDeterministicGenerateRenewal` returns `CYCLE_ID_REQUIRED` without id |
| No fallback resolvers (`earliest`, `next charge`, `dueYmd`) | ✅ | Removed from `subscriptionBillingGeneration.ts` |
| All `FinancialEvent` instances require `cycleId` in builder | ✅ | `pushEvent` type + `assertAllEventsHaveCycleId` |

## Removed from financial flow

- `buildFutureCycles()` as event source
- `resolveOfficialGenerateBillingTarget`
- `resolveEarliestUninvoicedCycleFromDetail`
- `resolveNextChargeCycleFromDetail`
- Synthetic projected rows in `subscriptionNextInvoiceResolver`

## Legacy (out of financial UI scope)

`buildFutureCycles` remains in `billingSubscriptionExperience.ts` for legacy polish/helpers (`buildCalendarMonths`, old `buildFinancialHistoryRows`). These are **not** used by `FinancialEventStore` or subscription detail financial tabs.

## Definition of done

- [x] Single source: `cycles_raw` → `buildFinancialEvents` → `FinancialEventStore` → UI
- [x] No projected competencies in financial surfaces
- [x] Generate always sends `cycle_id`
