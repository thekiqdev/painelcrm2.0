# Audit 1 — Cycle Identity Propagation (Sprint 4.2F)

**Mode:** READ ONLY  
**Date:** 2026-07-02  
**Scope:** Trace `cycle_id` from `subscription_cycles` to `POST /manual-renew`

---

## Trace chain

```
subscription_cycles (DB)
  → listSubscriptionCyclesBySubscriptionId (crmSubscriptionsService)
  → cycles_raw + buildSubscriptionTimeline (subscriptionTimelineUx)
  → normalizeDetailForBillingStateMachine (billingStateMachine FE)
  → buildFinancialEvents (subscriptionFinancialEventBuilder)
  → FinancialEventStore
  → UI components (Calendar / History / Next / Sidebar)
  → executeDeterministicGenerateRenewal (subscriptionBillingGeneration)
  → generateRenewalNow → POST /manual-renew
  → generateInvoiceForCycle (billingCycleInvoiceGenerationService)
  → getSubscriptionCycleById / findEarliestUninvoicedCycle
```

---

## Layer-by-layer field matrix

| Layer | `cycle_id` | `cycle_date` | `period_start` | `period_end` | `invoice_id` | `status` | Notes |
|-------|------------|--------------|----------------|--------------|--------------|----------|-------|
| **subscription_cycles** (DB) | ✓ UUID | ✓ DATE | ✓ DATE | ✓ DATE | ✓ nullable | ✓ CHECK enum | Source of truth |
| **cycles_raw** (API) | ✓ `id` | ✓ | ✓ | ✓ | ✓ | ✓ | 1:1 with DB when `cycles_read_enabled` |
| **timeline** (`merge_source=cycle`) | ✓ `cycle_id` | ✓ `cycle_date` | ✓ | ✓ | ✓ | ✓ `cycle_status` | From `buildTimelineRow` |
| **timeline** (`merge_source=invoice_only`) | **NULL** | from invoice | from invoice | from invoice | ✓ | **NULL** | No cycle row linked |
| **timeline** (`merge_source=lifecycle`) | **NULL** | event date | event date | NULL | **NULL** | **NULL** | Pause/resume rows |
| **subscriptionFinancialEventBuilder** (timeline) | ✓ `row.cycle_id` | via `due_date` | via labels | — | ✓ | via `cycle_status` / `operational_state` | Preserved when timeline has id |
| **subscriptionFinancialEventBuilder** (`buildFutureCycles`) | **NULL** | via `dueYmd` | **not set** | **not set** | **NULL** | projected only | **Uses `next_billing_date`** |
| **FinancialEvent** | ✓ / **NULL** | `dueYmd` | in `competence` label | — | ✓ / null | `statusLabel` | `cycleKey = cycleId ?? dueYmd ?? competence` |
| **FinancialCalendarEvent** | ✓ / **NULL** | `ymd` (display anchor) | — | — | ✓ | — | Copied from event |
| **FinancialHistoryRow** | ✓ / **NULL** | `dueYmd` | in `competence` | — | ✓ | `statusPt` | From `financialEventToHistoryRow` |
| **NextChargePresentation** | ✓ / **NULL** | `dueYmd` | `competenceLabel` | — | ✓ | — | Fallback: timeline match by `dueYmd` |
| **GenerateBillingTarget** (UI click) | explicit / **NULL** | `dueYmd` | — | — | — | — | Popover sends both |
| **resolveOfficialGenerateBillingTarget** | explicit → next → earliest | `dueYmd` **ignored** if no id | — | — | — | — | **GAP: no lookup by dueYmd alone** |
| **POST body** | `cycle_id` optional | — | — | — | — | — | |
| **generateInvoiceForCycle** | required path | from cycle row | from cycle row | from cycle row | validated null | validated status | DB re-fetch by id |

---

## Where `cycle_id` disappears (proven)

### 1. `subscriptionFinancialEventBuilder.ts` — projected cycles (lines 249–266)

```typescript
for (const cycle of buildFutureCycles(normalized, 12)) {
  pushEvent({ ..., cycleId: null, ... });
}
```

**Cause:** `buildFutureCycles` (`billingSubscriptionExperience.ts:618`) projects from `subscription.next_billing_date` and does not assign UUIDs. These events exist only in the frontend.

**Impact:** Any calendar day rendered from pure projection has **no** `cycle_id`.

---

### 2. `subscriptionTimelineUx.ts` — `invoice_only` merge (lines 530–550)

When an invoice exists without a matching `subscription_cycles` row, `buildTimelineRow` receives `cycle: null` → `cycle_id: null`.

**Impact:** Events built from these rows propagate `cycleId: null` even though a real invoice/competence exists.

---

### 3. `subscriptionTimelineUx.ts` — lifecycle rows (line 404)

Lifecycle events (pause/resume/reactivate) always set `cycle_id: null`. Correct for non-billing rows; skipped in event builder via `merge_source === 'lifecycle'`.

---

### 4. `cycles_read_enabled === false`

When the superadmin flag disables cycle read:

- `cycles_raw` = `[]`
- Timeline built only from `invoice_only` rows
- **All** financial events lack `cycle_id`
- Backend `findEarliestUninvoicedCycle` returns null → `cycle_required`

---

### 5. `resolveOfficialGenerateBillingTarget` — fallback replaces explicit `dueYmd`

When UI sends `{ cycleId: null, dueYmd: '2026-10-01' }` (calendar projection click):

1. Explicit `cycleId` empty → skipped
2. Falls back to `resolveNextChargeCycleFromDetail` (next upcoming event, not October)
3. Then `resolveEarliestUninvoicedCycleFromDetail` (oldest uninvoiced, not October)

**`dueYmd` from the clicked event is never used to resolve `cycle_id`.**

Evidence: `subscriptionBillingGeneration.ts:80–102` — no `cycles_raw.find(c => c.cycle_date === explicit.dueYmd)` branch.

---

### 6. Backend without `cycle_id`

`billingCycleInvoiceGenerationService.ts` → `findEarliestUninvoicedCycle` always picks **oldest** uninvoiced cycle, never the clicked competence.

---

## Date divergence (`ymd` vs `dueYmd` vs `cycle_date`)

| Source | Anchor field | Divergence |
|--------|--------------|------------|
| Calendar grid | `ev.ymd` | `invoice_generated` uses `invoice_created_at`, not due date |
| Calendar popover | `ev.dueYmd ?? ev.ymd` | Display may differ from grid cell day |
| `cycleKeyFromParts` | `cycleId ?? dueYmd ?? competence` | Collapses distinct cycles without id to same key |
| `buildFutureCycles` | `next_billing_date` + `advanceBillingDueYmd` | May not match any `subscription_cycles.cycle_date` |

---

## `next_billing_date` still in propagation path

| Location | Usage |
|----------|--------|
| `buildFutureCycles` | **Seeds all projected events** (no cycle_id) |
| `buildSubscriptionAutomationSummary` | Sidebar automation labels (not generate) |
| `ensureJobForManualGenerate` | Fallback `cycleKey` when `options.cycleKey` absent (line 346–349) |
| `automation_summary` in detail API | Display only |

Manual generate **should** pass `cycleKey` from 4.2D when `cycle_id` resolves; fallback to `next_billing_date` remains in `ensureJobForManualGenerate` if `cycleKey` option is missing.

---

## Summary

| Question | Answer |
|----------|--------|
| First layer losing `cycle_id` for real cycles? | `invoice_only` timeline merge |
| First layer losing `cycle_id` for projected cycles? | `buildFutureCycles` → `subscriptionFinancialEventBuilder` |
| Where competence can change after click? | `resolveOfficialGenerateBillingTarget` fallback chain |
| Manual date reconstruction? | Yes — `buildFutureCycles` from `next_billing_date` |
