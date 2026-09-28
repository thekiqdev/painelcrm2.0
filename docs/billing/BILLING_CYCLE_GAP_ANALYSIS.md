# Billing Cycle Gap Analysis — Sprint 4.2K

**Question:** How can a competency disappear (e.g. Jul → Aug → Oct without Sep)?  
**Mode:** READ ONLY

---

## Executive answer

A month can **disappear from `subscription_cycles`** (no row) or **disappear from “billable real cycles”** (row exists as `cancelled` / never enqueued) while still **appearing in the calendar** via the projection layer. These are distinct phenomena with different root causes.

---

## Mechanism 1 — Lazy cycle materialization (primary)

**Fact:** The billing runtime does **not** pre-create one `subscription_cycles` row per calendar month.

Rows are created only when:

1. Scheduler enqueues a job for that `cycle_date` (`subscriptionCyclesUpsertAfterScheduler`)
2. Worker touches a job (`subscriptionCyclesMarkProcessing`, etc.)
3. Migration backfill (`141_subscription_cycles_phase1.sql`)
4. Repair services mutate existing rows (no new dates)

**Consequence:** If `next_billing_date` jumps from Aug → Oct (manual PATCH, interval recalc, or `max(oldNext, computedNext)` staying ahead), **September never gets a scheduler enqueue** → **no Sep row** in `cycles_raw`.

### Example timeline

| Step | `next_billing_date` | `subscription_cycles` rows |
|------|---------------------|----------------------------|
| Jul invoiced | 2026-08-14 | Jul `invoiced`, Aug `queued` |
| User PATCH next to Oct | 2026-10-14 | Aug job cancelled → Aug `cancelled`; Oct job enqueued → Oct `queued` |
| Result | — | **No Sep row** |

---

## Mechanism 2 — Cancelled cycle ≠ deleted cycle

When users report “Setembro sumiu”, they may mean:

| Observation | DB reality |
|-------------|------------|
| No row in History with Gerar | No row at all (Mechanism 1) OR row `cancelled` / `invoiced` |
| Calendar shows Sep dot | Projection layer (`kind: projected`) |
| History shows Sep without Gerar | Projected row — **by design** since 4.2G (`cycle_id` null) |

Cancelled cycles **remain** in DB with `status = cancelled`. They are not deleted (`grep DELETE FROM subscription_cycles` → no matches).

---

## Mechanism 3 — Projection layer divergence (UX)

`src/lib/subscriptionFinancialProjection.ts`:

```typescript
// Projects from next_billing_date + advanceBillingDueYmd
const raw = buildFutureCycles(detail, count + occupied.size);
// Skips dates already in cycles_raw (occupiedDueDatesFromDetail)
```

| Layer | Source | Sep visible? |
|-------|--------|--------------|
| `cycles_raw` | DB dual-write | Only if enqueued/processed |
| Projection | `next_billing_date` arithmetic | **Every** month in sequence until cap 12 |
| Display merge | `mergeRealAndProjectionEvents` | Real wins on same date |

**After PATCH to Oct:** projection still walks Aug+1mo, Sep+1mo from **current** `next_billing_date` only if starting anchor is Oct — actually `buildFutureCycles` starts from `next_billing_date`, so projected months are Oct, Nov, Dec… **not Sep**.

**Gap in calendar (Jul, Aug, Oct dots):** Occurs when:

- Real cycles exist for Jul, Aug (cancelled or pending), Oct (queued)
- Projection fills **future** from `next_billing_date` (Oct+) 
- Sep has no real row and is **not** between next_billing and projected sequence if anchor already past Sep

**Jul → Aug → Oct pattern specifically:**

1. Aug cycle cancelled (reschedule side effect)
2. Oct becomes `next_billing_date`
3. No Sep job ever created
4. UI calendar may show Oct (real) + Nov+ (projected) but **skip Sep** in both layers if neither real nor projection path includes it

---

## Mechanism 4 — Advance skips when already ahead

`computeFinalNextBillingForCompletedCycle`:

```typescript
finalNextYmd = max(computedNextYmd, oldNext)  // skippedAlreadyAhead if old > computed
```

If `next_billing_date` was manually set far ahead, completing an **older** cycle does not move next backward but may not create intermediate cycle rows for months between old job cycle and final next.

---

## Mechanism 5 — Billing interval / anchor change

`crmSubscriptionsContractService.applyContractToSubscriptionImmediate` recalculates dates on interval change via `computeCrmContractDatesAfterIntervalChange`. Non-monthly intervals or anchor realignment can skip calendar months in **date sequence** even when billing is correct.

---

## Mechanism 6 — False “gap” from UI filtering (post-4.2J)

| Sprint | History behavior |
|--------|------------------|
| 4.2I | Single future row — hid multiple real cycles |
| 4.2J | All real eligible cycles shown |

If user still sees gaps, cause is **data layer** (Mechanisms 1–5), not history filter.

---

## Projection vs `subscription_cycles` consistency matrix

| Condition | Real cycle | Projection | User perception |
|-----------|------------|------------|-----------------|
| Normal monthly advance | Next month row created on enqueue | Next months shown | Aligned |
| PATCH skip month | No row for skipped month | May or may not show skipped month | **Gap** |
| Cancelled mid-cycle | Row `cancelled` | Occupied date excluded from projection | Month “exists” but dead |
| No scheduler run | Only past invoiced rows | Shows future from next_billing | Calendar richer than DB |
| `next_billing` null / cancelled sub | No new rows | Projection empty | No future |

---

## Root cause statement (competency disappearance)

> **Root cause:** `subscription_cycles` is a **materialized trace of billing runtime events**, not a complete calendar of expected competencies. Any operation that moves `next_billing_date` without enqueueing intermediate cycles (manual PATCH, contract change, mismatch cancel + selective re-enqueue, or advance-already-ahead) produces **absent competencies** in `cycles_raw` while the UI projection layer may still show different months depending on anchor arithmetic.

---

## Verification checklist

1. List all `subscription_cycles` ordered by `cycle_date` — is Sep missing or `cancelled`?
2. Read `subscriptions.next_billing_date` history from billing logs (`customer_subscription_next_billing_manual`)
3. Check jobs with `completion_outcome = cancelled_job_cycle_mismatch_after_reschedule` or `cancelled_manual_next_billing_reschedule`
4. Compare UI event `kind`: `real` vs `projected`
5. Confirm whether Sep ever had `billing_recurring_jobs.cycle_key = Sep date`

---

## Remediation direction (see BILLING_FINAL_ROOT_CAUSE.md)

Do **not** fix in 4.2K. Options for future sprints:

- Materialize gap cycles on PATCH (insert `pending` rows for skipped months as `skipped`/`cancelled` with reason)
- Backfill reconciliation job for date holes vs `next_billing_date` chain
- UI: distinguish “no cycle row” from “cancelled cycle” explicitly
- Single-writer policy for `next_billing_date` changes with mandatory cycle row sync
