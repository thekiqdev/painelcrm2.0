# BILLING_CYCLE_IDENTITY_CERTIFICATION — Sprint 4.2G

**Status:** CERTIFIED

## Identity rules

| Surface | Field | Rule |
|---------|-------|------|
| `FinancialEvent` | `cycleId` | Required; sourced from `cycles_raw[].id` |
| `FinancialCalendarEvent` | `cycleId` | Copied from event |
| `FinancialHistoryRow` | `cycleId` | Copied from event |
| `NextChargePresentation` | `cycleId` | From first eligible cycle or matching event |
| Generate button | `cycleId` | Required; `invoiceCapabilities.supportsGenerate` false without it |
| API `POST manual-renew` | `cycle_id` | Required; `CYCLE_ID_REQUIRED` if missing |

## First eligible cycle algorithm

`resolveFirstEligibleCycle(detail)`:

1. Skip if subscription `cancelled`
2. Iterate `cycles_raw` sorted by `cycle_date` ASC
3. Select first where `invoice_id == null` and `status` ∈ `{pending, queued, failed, skipped, cancelled}`
4. Never reads `next_billing_date`

## Generate flow

```
User click (Calendar | History | Sidebar | Next Invoice)
  → GenerateBillingTarget { cycleId, dueYmd?, componentName }
  → executeDeterministicGenerateRenewal
  → crmSubscriptionsService.generateRenewalNow({ cycleId })
  → Backend generateInvoiceForCycle(cycle_id)  [unchanged]
```

## UI guards

- `FinancialCalendarPopover`: no generate callback if `!ev.cycleId`
- `NextInvoiceCard`: action hidden if `!next.cycleId`
- `FinancialSummarySidebar`: billing_missing alert skips generate if `!nextInvoice.cycleId`
- `SubscriptionRenewalActionsCard`: resolves `resolveFirstEligibleCycle` before API call

## Prohibited

- Events with `cycleId: null`
- Generate without explicit `cycle_id`
- Competency discovery via `dueYmd`, `next_billing_date`, or `advanceBillingDueYmd` for billing target resolution
