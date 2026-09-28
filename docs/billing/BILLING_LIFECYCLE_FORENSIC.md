# Billing Lifecycle Forensic Audit — Sprint 4.2K

**Sprint:** 4.2K — Billing Lifecycle Forensic Audit  
**Mode:** READ ONLY — no code, DB, engine, worker, scheduler, runtime, API, or UI changes  
**Date:** 2026-07-02

---

## Objective

Identify root causes of inconsistencies between `subscription_cycles`, `billing_recurring_jobs`, `customer_invoices`, and UI projections. This document is the master index; detailed ownership and root-cause analysis live in companion reports listed below.

---

## Architecture snapshot

```
subscriptions.next_billing_date
        │
        ▼
┌───────────────────┐     INSERT/UPDATE      ┌─────────────────────────┐
│ Scheduler         │ ─────────────────────► │ billing_recurring_jobs  │
│ enqueueRenewalJobs│                        │ (pending → processing → │
└───────────────────┘                        │  completed | cancelled) │
        │                                    └───────────┬─────────────┘
        │ dual-write                                   │
        ▼                                              │ Worker / Manual
┌───────────────────┐                                  │
│ subscription_cycles│ ◄── dual-write ────────────────┘
│ (lazy per cycle)   │
└─────────┬─────────┘
          │ invoice_id (on success)
          ▼
┌───────────────────┐
│ customer_invoices │
└───────────────────┘

Frontend (UX only, Sprint 4.2H):
  cycles_raw → real FinancialEvents (cycle_id required for Gerar)
  next_billing_date + advanceBillingDueYmd → projected events (no cycle_id)
```

**Critical invariant:** Cycles are **not** pre-materialized for every future month. Rows appear when scheduler enqueues, worker processes, manual generate runs, migration backfill, or reconciliation/repair runs.

---

## Mandatory questions — answers

| Question | Owner / answer | Evidence |
|----------|----------------|----------|
| Quem cria `subscription_cycles`? | Dual-write scheduler + worker; migration backfill; reconciliation (read-only script, no INSERT in prod path) | `subscriptionCyclesDualWriteService.ts`; `141_subscription_cycles_phase1.sql` |
| Quem cancela `subscription_cycles`? | `subscriptionCyclesOnJobCancelled` (all job cancel paths); never hard-deleted | `subscriptionCyclesDualWriteService.ts:363` |
| Quem cria `billing_recurring_jobs`? | `insertOrReactivateRenewalJob` (scheduler, post-mismatch re-enqueue, manual generate, PATCH re-enqueue) | `recurringBillingJobService.ts:356`, `:503` |
| Quem cancela jobs? | Worker (`cancelBillingRecurringJob`); CRM PATCH (`cancelPendingRenewalJobsForSubscription`) | `billingRecurringJobPersistence.ts:224`; `customerInvoiceRecurrenceNextBillingService.ts:141` |
| Quem altera `next_billing_date`? | `advanceSubscriptionAfterCompletedCycle`; CRM PATCH/resume/reactivate; contract interval change; SaaS bootstrap; renewal validation repair | See `BILLING_NEXT_BILLING_TRACE.md` |
| Quem altera `cycle_date`? | **Nobody directly.** Immutable identity `(subscription_id, cycle_date)`. New competence = new row. | DB UNIQUE; dual-write INSERT only |
| Quem altera `period_start` / `period_end`? | Dual-write upsert via `loadPeriodBounds` + `calculateNextBillingDate`; frozen when `status = invoiced` | `subscriptionCyclesDualWriteService.ts:47–66`, `:111–118` |
| Quem cria `invoice_id` on cycle? | `subscriptionCyclesOnJobCompleted` when worker/manual completes with `customer_invoice` | `subscriptionCyclesDualWriteService.ts:310–322` |
| Quem limpa `invoice_id`? | `customerInvoiceAdminService` on invoice delete | `customerInvoiceAdminService.ts:444` |
| Quem gera `cancelled_job_cycle_mismatch_after_reschedule`? | Worker at job pickup when `job.cycle_key ≠ subscription.next_billing_date` | `recurringBillingJobService.ts:1506–1518` |
| Quem decide ciclo **skipped**? | Worker completion without customer invoice (`subscriptionCyclesOnJobCompleted` → `skipped`) | `subscriptionCyclesDualWriteService.ts:326–353` |
| Quem decide ciclo **cancelled**? | Job cancellation dual-write (`subscriptionCyclesOnJobCancelled`); guard skips false obsolete on mismatch | `subscriptionCyclesDualWriteService.ts:363–402` |

---

## Inconsistency classes observed

| Symptom | Primary cause | Report |
|---------|---------------|--------|
| Competência “desaparece” (Jul → Ago → Out, sem Set) | Lazy cycle materialization + `next_billing_date` jump + projection fills calendar | `BILLING_CYCLE_GAP_ANALYSIS.md` |
| `cancelled_job_cycle_mismatch_after_reschedule` | Job enqueued for cycle A; `next_billing_date` changed to B before worker pickup | `BILLING_JOB_CANCELLATION_ANALYSIS.md` |
| UI shows month without Gerar | Projection row (`kind: projected`, `cycle_id: null`) vs real cycle | `BILLING_CYCLE_GAP_ANALYSIS.md` § Projection |
| Cycle `cancelled` but subscription active | Mismatch cancel or manual reschedule cancel without official cancel marker | `BILLING_JOB_CANCELLATION_ANALYSIS.md` |
| Job `completed` but cycle not `invoiced` | Tenant billing or no-eligible-items outcome → cycle `skipped` | `BILLING_CYCLE_OWNERSHIP.md` § Completed |

---

## Companion reports

| Report | Scope |
|--------|-------|
| [BILLING_CYCLE_OWNERSHIP.md](./BILLING_CYCLE_OWNERSHIP.md) | All writers of `subscription_cycles` |
| [BILLING_JOB_OWNERSHIP.md](./BILLING_JOB_OWNERSHIP.md) | All writers of `billing_recurring_jobs` |
| [BILLING_NEXT_BILLING_TRACE.md](./BILLING_NEXT_BILLING_TRACE.md) | All writers of `subscriptions.next_billing_date` |
| [BILLING_CYCLE_GAP_ANALYSIS.md](./BILLING_CYCLE_GAP_ANALYSIS.md) | Missing competencies root cause |
| [BILLING_JOB_CANCELLATION_ANALYSIS.md](./BILLING_JOB_CANCELLATION_ANALYSIS.md) | Mismatch outcome deep dive |
| [BILLING_RUNTIME_SEQUENCE_DIAGRAM.md](./BILLING_RUNTIME_SEQUENCE_DIAGRAM.md) | Scheduler / Worker / Manual sequences |
| [BILLING_FINAL_ROOT_CAUSE.md](./BILLING_FINAL_ROOT_CAUSE.md) | Evidence-based remediation plan |

---

## Definition of done (Sprint 4.2K)

| Criterion | Status |
|-----------|--------|
| No functional changes | ✓ |
| All write owners identified | ✓ (companion reports) |
| All state transitions documented | ✓ (cycle + job graphs in ownership reports) |
| Root cause: missing competencies | ✓ (`BILLING_CYCLE_GAP_ANALYSIS.md`) |
| Root cause: mismatch cancellation | ✓ (`BILLING_JOB_CANCELLATION_ANALYSIS.md`) |
| Remediation plan without assumptions | ✓ (`BILLING_FINAL_ROOT_CAUSE.md`) |

---

## Prior sprint context (4.2G–4.2J)

- **4.2G:** UI billing source = `cycles_raw` only; `cycle_id` required for generate.
- **4.2H:** Projection layer (UX-only) from `next_billing_date`; never generates.
- **4.2I:** Single future history row (superseded).
- **4.2J:** Gerar restored on all eligible real cycles with `cycle_id`.

These sprints fixed **UI identity** but did not change runtime cycle/job materialization — hence lifecycle gaps persist at DB layer.
