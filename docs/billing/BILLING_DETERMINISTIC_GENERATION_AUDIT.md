# Audit 4 — Deterministic Generation (Sprint 4.2F)

**Mode:** READ ONLY  
**Goal:** Prove whether any competence can be billed in any order.

---

## Intended algorithm (Sprint 4.2D)

```
POST /manual-renew { cycle_id }
  → getSubscriptionCycleById
  → validate invoice_id IS NULL + status eligible
  → manualGenerateRenewalNow({ cycleKey: cycle.cycle_date })
  → ensureJobForManualGenerate({ cycleKey })
  → worker pipeline (unchanged)
```

When `cycle_id` **omitted**:

```
findEarliestUninvoicedCycle ORDER BY cycle_date ASC
```

---

## Test matrix (code-path analysis)

| Scenario | `cycle_id` in request | Backend behavior | Clicks correct month? |
|----------|----------------------|------------------|----------------------|
| Gerar Julho, Agosto já faturado | `cycle-jul` | Bills Julho row | ✓ if UI sends id |
| Gerar Julho, Agosto já faturado | **omitted** | Bills **earliest** uninvoiced (Julho) | ✓ accidental |
| Gerar Agosto, Setembro faturado | `cycle-ago` | Bills Agosto | ✓ if UI sends id |
| Gerar Outubro antes de Setembro | `cycle-out` | Bills Outubro | ✓ if UI sends id |
| Gerar Outubro antes de Setembro | **omitted** | Bills **earliest** (not Out) | ✗ |
| Competência 12 meses atrás | explicit id | Bills that cycle | ✓ |
| Competência futura (DB row) | explicit id | Bills that cycle | ✓ |
| Competência futura (projected only) | **null** / omitted | Earliest or `cycle_required` | ✗ |
| skipped + recoverable | explicit id, status `skipped` | Allowed (`GENERATABLE_CYCLE_STATUSES`) | ✓ |
| pending | explicit id | Allowed | ✓ |
| recovered (legacy cancelled) | explicit id, status `cancelled` | Allowed if no invoice | ✓ |
| invoiced | any | `cycle_not_generatable` | ✓ blocked |
| processing | any | `cycle_not_generatable` | ✓ blocked |

---

## Frontend resolver impact

`resolveOfficialGenerateBillingTarget` order:

1. Explicit `cycleId` (from click) → **deterministic** ✓
2. `resolveNextChargeCycleFromDetail` → **next** upcoming, not arbitrary click
3. `resolveEarliestUninvoicedCycleFromDetail` → **oldest**, not arbitrary click

**Theorem (proven from code):** Determinism holds **iff** `cycle_id` reaches the API. Without it, system always bills next-or-earliest, never "clicked unless click == next/earliest".

---

## UI paths that preserve `cycle_id`

| Entry point | Sends `cycle_id` when available? | Sends when projected? |
|-------------|-----------------------------------|----------------------|
| NextInvoiceCard | ✓ `next.cycleId` | N/A (next resolver) |
| FinancialHistoryRow | ✓ `row.cycleId` | N/A (one row) |
| FinancialCalendarPopover | ✓ if `ev.cycleId` | **✗ null** |
| Sidebar alert | ✓ `nextInvoice.cycleId` | N/A |
| UpcomingPaymentsList | ✓ per event | **✗ if projected** |
| SubscriptionActionsPanel | via resolver | fallback only |
| SubscriptionRenewalActionsCard | via resolver | fallback only |

---

## Backend residual `next_billing_date` usage

| Path | Uses `next_billing_date`? |
|------|---------------------------|
| `generateInvoiceForCycle` with valid `cycle_id` | **No** — uses `cycle.cycle_date` |
| `generateInvoiceForCycle` without `cycle_id` | **No** — `findEarliestUninvoicedCycle` |
| `ensureJobForManualGenerate` without `cycleKey` option | **Yes** — fallback line 346–349 |
| `manualGenerateRenewalNow` from 4.2D path | Passes `cycleKey` from cycle row ✓ |

---

## Duplicate invoice protection

| Guard | Location |
|-------|----------|
| `cycle.invoice_id` check | `validateCycleForInvoiceGeneration` |
| UNIQUE `(subscription_id, cycle_date)` | DB migration 141 |
| Job same logical cycle | `BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE` |

---

## Conclusion

| Expected behavior | Proven? |
|-------------------|---------|
| Always bills clicked competence | **Only with explicit `cycle_id`** |
| Never bills next sequence when different clicked | **Fails when `cycle_id` null** |
| Never alters other competencies | ✓ (single cycle update) |
| Any existing cycle billable out of order | ✓ backend; ⚠ UI must send id |

**Root gap:** Identity loss in UI → fallback billing → wrong competence.
