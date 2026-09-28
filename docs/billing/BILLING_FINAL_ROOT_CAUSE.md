# Billing Final Root Cause — Sprint 4.2K

**Mode:** READ ONLY — remediation plan only, no implementation in 4.2K  
**Date:** 2026-07-02

---

## Summary

Inconsistencies between `subscription_cycles`, `billing_recurring_jobs`, invoices, and UI are **not** caused by a single bug in invoice generation. They arise from **architectural decoupling**:

1. **Cycles are event-sourced lazily** — not a full competency calendar.
2. **`next_billing_date` has multiple writers** without mandatory cycle row synchronization.
3. **Jobs snapshot `cycle_key` at enqueue** but **validate at pickup** against live subscription state.
4. **UI projection layer** (Sprint 4.2H) synthesizes future months independent of DB rows.

Prior sprints 4.2G–4.2J fixed **UI billing identity** (`cycle_id` required). Sprint 4.2K confirms **runtime/data layer gaps remain**.

---

## Root cause #1 — Missing competencies (Jul → Aug → Oct, no Sep)

| Item | Detail |
|------|--------|
| **Symptom** | Month absent from `cycles_raw` or only visible as projection |
| **Root cause** | `subscription_cycles` rows created only on scheduler/worker/manual/repair events; manual or computed jumps of `next_billing_date` skip intermediate enqueue |
| **Evidence** | `subscriptionCyclesUpsertAfterScheduler` only on job activity; PATCH path in `customerInvoiceRecurrenceNextBillingService.ts:69-82`; no INSERT for gap months |
| **Not root cause** | UI history filter (removed in 4.2J); invoice engine miscalculating Sep |

**Confidence:** High — documented in `BILLING_CYCLE_GAP_ANALYSIS.md` with code paths.

---

## Root cause #2 — `cancelled_job_cycle_mismatch_after_reschedule`

| Item | Detail |
|------|--------|
| **Symptom** | Job cancelled; old cycle `cancelled`; queue may stall |
| **Root cause** | Enqueued `cycle_key` obsolete when `next_billing_date` changes before worker pickup |
| **Evidence** | Single emit: `recurringBillingJobService.ts:1506-1518`; 8 writers to `next_billing_date` |
| **Intentional?** | Yes — prevents billing wrong competence |
| **Side effect** | `subscriptionCyclesOnJobCancelled` marks old cycle cancelled; re-enqueue may fail billing window |

**Confidence:** High — `BILLING_JOB_CANCELLATION_ANALYSIS.md`.

---

## Root cause #3 — Projection vs billing source divergence

| Item | Detail |
|------|--------|
| **Symptom** | Calendar shows months without Gerar; user thinks cycle “exists” |
| **Root cause** | `buildProjectionEvents` uses `next_billing_date` + `advanceBillingDueYmd`; projected events have `cycle_id: null` by design |
| **Evidence** | `subscriptionFinancialProjection.ts:39-77`; certified in 4.2H |
| **Not a bug** | UX layer; billing correctly refuses generate without `cycle_id` |

**Confidence:** High — intentional architecture post-4.2G.

---

## Root cause #4 — Legacy false-cancelled cycles

| Item | Detail |
|------|--------|
| **Symptom** | Active subscription with `cancelled` cycles without invoice |
| **Root cause** | Job cancel dual-write marks cycle cancelled for operational cancels (mismatch, reschedule) without official cancel markers |
| **Evidence** | `legacyCancelledCycleRecovery.ts`; `OFFICIAL_CYCLE_CANCEL_MARKERS` |
| **Mitigation exists** | Recovery service reverts false cancels — not always run automatically |

**Confidence:** Medium-high — known issue from Sprint 4.2B.

---

## Root cause #5 — Concurrent actor races (scheduler / PATCH / worker)

| Item | Detail |
|------|--------|
| **Symptom** | Duplicate cancel + empty queue; processing job on stale cycle |
| **Root cause** | `cancelPendingRenewalJobsForSubscription` only targets `status = pending`; PATCH vs worker overlap |
| **Evidence** | `customerInvoiceRecurrenceNextBillingService.ts:158`; worker processes `processing` jobs |

**Confidence:** Medium — requires log correlation per incident.

---

## Remediation plan (evidence-based, ordered)

### P0 — Data integrity (backend, future sprint)

| # | Action | Addresses | Risk |
|---|--------|-----------|------|
| 1 | **Cycle gap materialization:** On any `next_billing_date` change, insert or update `subscription_cycles` for skipped dates as `cancelled`/`skipped` with reason `superseded_by_reschedule` | RC #1 | Low — dual-write only |
| 2 | **PATCH job drain:** Extend bulk cancel to `processing` jobs whose `cycle_key ≠ next_billing_date` | RC #2, #5 | Medium — must not kill in-flight valid job |
| 3 | **Mandatory enqueue:** After every `next_billing_date` write, call `tryEnqueueRenewalJobForSubscriptionId` with structured failure surfacing (not best-effort silent) | RC #2 | Low |

### P1 — Observability

| # | Action | Addresses |
|---|--------|-----------|
| 4 | Dashboard: subscription timeline of `next_billing_date` writes + job outcomes + cycle row diffs | All |
| 5 | Alert on mismatch cancel rate per tenant | RC #2 |

### P2 — UX clarity (frontend, future sprint)

| # | Action | Addresses |
|---|--------|-----------|
| 6 | Calendar legend: Real vs Projected vs Cancelled-gap | RC #3, #1 |
| 7 | When month has no `cycle_id`, show “Competência não materializada” not generic Prevista | RC #1 |

### P3 — Policy consolidation

| # | Action | Addresses |
|---|--------|-----------|
| 8 | Single **NextBillingChangeService** owning all writes + cycle sync + job cancel/enqueue | RC #1, #2, #5 |
| 9 | Subscription `billing_generation_epoch` incremented on reschedule; jobs store epoch at enqueue | RC #2 |

### Explicit non-recommendations

| Do not | Reason |
|--------|--------|
| Remove mismatch guard | Would bill wrong competence |
| Pre-create 12 months of cycles always | Conflicts with lazy model unless product requires full calendar |
| Use projection for generate target | Violates 4.2G certification |
| Change billing engine invoice logic in 4.2K | Out of scope |

---

## Acceptance criteria for fix sprint (future)

1. PATCH `next_billing_date` from A to C (skipping B) leaves trace: cycle B row exists with documented status or audit event.
2. Mismatch cancel rate → 0 for normal PATCH flow (only edge races).
3. `cycles_raw` count ≥ invoiced + pending + cancelled-with-reason for all dates between subscription start and `next_billing_date`.
4. UI never implies Gerar on projected-only months (already true post-4.2J).
5. Forensic query pack returns consistent chain: sub → jobs → cycles → invoices.

---

## Cross-reference

| Document | Content |
|----------|---------|
| [BILLING_LIFECYCLE_FORENSIC.md](./BILLING_LIFECYCLE_FORENSIC.md) | Master index + mandatory Q&A |
| [BILLING_CYCLE_OWNERSHIP.md](./BILLING_CYCLE_OWNERSHIP.md) | Cycle writers + state machine |
| [BILLING_JOB_OWNERSHIP.md](./BILLING_JOB_OWNERSHIP.md) | Job writers + state machine |
| [BILLING_NEXT_BILLING_TRACE.md](./BILLING_NEXT_BILLING_TRACE.md) | `next_billing_date` writers |
| [BILLING_CYCLE_GAP_ANALYSIS.md](./BILLING_CYCLE_GAP_ANALYSIS.md) | Missing month analysis |
| [BILLING_JOB_CANCELLATION_ANALYSIS.md](./BILLING_JOB_CANCELLATION_ANALYSIS.md) | Mismatch analysis |
| [BILLING_RUNTIME_SEQUENCE_DIAGRAM.md](./BILLING_RUNTIME_SEQUENCE_DIAGRAM.md) | Sequences |

---

## Sprint 4.2K completion

| DoD item | Status |
|----------|--------|
| No functional changes | ✓ |
| All write owners identified | ✓ |
| State transitions documented | ✓ |
| Missing competency root cause | ✓ RC #1 |
| Mismatch root cause | ✓ RC #2 |
| Evidence-based remediation | ✓ above |
