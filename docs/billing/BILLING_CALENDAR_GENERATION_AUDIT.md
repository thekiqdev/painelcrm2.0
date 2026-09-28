# Audit 3 — Calendar Generation (Sprint 4.2F)

**Mode:** READ ONLY  
**Goal:** Explain why Calendário can send `cycle_id` null and divergent dates.

---

## Flow trace

```
FinancialCalendar (day grid)
  → eventsByDay from FinancialEventStore (key = ev.ymd)
  → FinancialCalendarPopover (dayEvents for clicked day)
  → pickPrimaryEvent(dayEvents) — single event for actions
  → InvoiceDirectActions → onGenerateBilling({ cycleId: ev.cycleId, dueYmd })
  → executeDeterministicGenerateRenewal
  → POST /manual-renew
```

---

## Event clicked vs event billed

### Calendar day selection

- Grid groups by **`ev.ymd`**, not `ev.dueYmd` (`financialEventHelpers.groupEventsByDay`)
- `invoice_generated` events use `ymd = invoice_created_at` while `dueYmd` may differ
- User may open a day showing generation date, but popover shows `dueYmd` for vencimento

### Popover primary event

`FinancialCalendarPopover` uses `pickPrimaryEvent(sortEventsByPriority(events))` — **one** event per day when multiple exist. User may not generate the event they visually associate with the competence if another type has higher priority.

---

## `cycle_id` null scenarios (calendar)

| Event source | `cycleId` | `dueYmd` | Generate button |
|--------------|-----------|----------|-----------------|
| Timeline row with DB cycle | ✓ UUID | ✓ `due_date` | ✓ `supportsGenerate` |
| Timeline `invoice_only` | **null** | ✓ | ✓ if `upcoming_cycle` |
| `buildFutureCycles` projection | **null** | ✓ projected | ✓ if `upcoming_cycle` |
| Paid / invoiced | null or id | ✓ | ✗ open only |
| Failed recoverable | ✓ or null | ✓ | ✓ resolve/generate |

---

## Validated field mapping

| Check | Projected cycle (no DB row) | DB cycle (Julho) |
|-------|----------------------------|------------------|
| Event clicked | `upcoming-2026-10-01` | `sched-{uuid}-2026-07-01` |
| `cycle_date` rendered | Oct due in competence label | Jul due |
| `cycle_date` sent | `dueYmd` in target only | `cycleId` UUID |
| `cycle_id` sent | **null** | ✓ UUID |
| HTTP payload | `{}` or wrong id after fallback | `{ cycle_id: "..." }` |
| Competência gerada | **Earliest uninvoiced or next charge** | Julho ✓ |

---

## Root cause: `cycle_id` null on calendar click

**File:** `subscriptionFinancialEventBuilder.ts:249–266`

Projected months from `buildFutureCycles` intentionally set `cycleId: null`. Calendar popover forwards that null:

```typescript
onGenerateBilling?.({ cycleId: ev.cycleId, dueYmd: ev.dueYmd ?? ev.ymd });
```

**File:** `subscriptionBillingGeneration.ts:80–102`

Resolver does **not** map `dueYmd` → `cycles_raw[].id` when `cycleId` is absent. It jumps to next-charge / earliest-uninvoiced fallback.

**Evidence of divergent dates:**

| User action | `dueYmd` sent | `cycle_id` sent | Actual billing target |
|-------------|---------------|-----------------|----------------------|
| Click Outubro (projected) | 2026-10-01 | null | Julho (earliest) or Sep (next) |
| Click Julho (DB, past) | 2026-07-01 | cycle-jul | Julho ✓ |
| Click Julho (DB) when Aug is next in resolver | 2026-07-01 | cycle-jul | Julho ✓ (explicit id wins) |

---

## `next_billing_date` involvement in calendar

`buildFutureCycles` (`billingSubscriptionExperience.ts:621`):

```typescript
let due = normalizeYmdInput(s.next_billing_date);
```

Projected calendar dots **after** the last timeline cycle are anchored to `next_billing_date`, not to `subscription_cycles`. They never receive `cycle_id` until scheduler/worker creates the row.

---

## Multi-event days

If a day has both `payment` and `upcoming_cycle`, `pickPrimaryEvent` may prefer payment (lower `eventTypePriority` = higher precedence). Generate action may be hidden even though user sees an upcoming dot in the mini card list.

---

## Conclusion

| Question | Answer |
|----------|--------|
| Why `cycle_id` null? | Projected events + `invoice_only` timeline rows |
| Why dates diverge? | `ymd` vs `dueYmd`; projection from `next_billing_date` |
| Does calendar always bill clicked month? | **NO** when `cycle_id` null |
| Fix location (next sprint) | Resolve `dueYmd` → `cycles_raw` before fallback; or stop showing generate on projected events without id |
