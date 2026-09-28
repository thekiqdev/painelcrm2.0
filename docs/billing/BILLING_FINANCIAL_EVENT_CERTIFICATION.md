# BILLING_FINANCIAL_EVENT_CERTIFICATION — Sprint 4.2G

**Status:** CERTIFIED

## Rules

1. Every `FinancialEvent` is emitted from a `subscription_cycles` row via `listCyclesFromDetail`.
2. Every pushed event includes `cycleId: string` (non-null).
3. No synthetic events are created from `next_billing_date` or interval projection.
4. `FinancialEventStore.getHistoryRows()` skips events without `cycleId`.
5. `FinancialEventStore.getCalendarEvents()` maps store events only (no synthetic days).

## Builder contract

```typescript
// subscriptionFinancialEventBuilder.ts
for (const cycle of listCyclesFromDetail(normalized)) {
  const row = timelineRowForCycle(normalized, cycle);
  emitEventsForCycleRow(..., cycle, row);
}
```

`pushEvent` requires `cycleId: string` in its payload type.

## History (Phase 5)

- All competencies from `cycles_raw` appear in history (no next-charge-only filter).
- `isNextCharge` flags the first eligible uninvoiced cycle only (display highlight).
- `canGenerateNow` enabled for every uninvoiced `upcoming_cycle` with `cycleId` (`billingStateMachine.resolveHistoryRowState`).

## Tests

| Test file | Assertion |
|-----------|-----------|
| `subscriptionFinancialEventBuilder.test.ts` | Events from cycles_raw; empty cycles → zero events |
| `subscriptionFinancialEvents.test.ts` | `events.every(e => e.cycleId)` |
| `subscriptionFinancialConsistencyAudit.test.ts` | Cross-surface parity |

## Audit helper

`assertAllEventsHaveCycleId(events)` in `subscriptionCyclesSource.ts` — use in dev to validate collections.
