# Billing Runtime Sequence Diagram — Sprint 4.2K

**Mode:** READ ONLY  
**Scope:** Scheduler, Worker, Manual Generate — interaction on same cycle

---

## 1. Happy path — automatic renewal

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Scheduler cron
  participant Sch as enqueueRenewalJobs
  participant Sub as subscriptions
  participant Job as billing_recurring_jobs
  participant Cyc as subscription_cycles
  participant W as Worker
  participant Eng as BillingExecutionOrchestrator
  participant Inv as customer_invoices

  Cron->>Sch: tick
  Sch->>Sub: SELECT active, next_billing in window
  Sch->>Job: insertOrReactivateRenewalJob (pending)
  Sch->>Cyc: subscriptionCyclesUpsertAfterScheduler (queued)

  W->>Job: pickup pending → processing
  W->>Cyc: subscriptionCyclesMarkProcessing
  W->>Sub: READ next_billing_date
  Note over W: cycle_key must match next_billing

  W->>Eng: executeWorkerCrmRenewal
  Eng->>Inv: persist invoice
  W->>Job: completeBillingRecurringJob (completed)
  W->>Cyc: subscriptionCyclesOnJobCompleted (invoiced + invoice_id)
  W->>Sub: advanceSubscriptionAfterCompletedCycle (next_billing += interval)
```

---

## 2. Manual generate (Sprint 4.2D) — same engine, explicit cycle

```mermaid
sequenceDiagram
  autonumber
  participant UI as Frontend
  participant API as POST manual-renew
  participant Gen as generateInvoiceForCycle
  participant CycQ as subscriptionCyclesQueryService
  participant Man as billingManualRenewalService
  participant Job as billing_recurring_jobs
  participant W as executeRenewalJobSynchronously

  UI->>API: cycle_id (required)
  API->>Gen: validateCycleForInvoiceGeneration
  Gen->>CycQ: getSubscriptionCycleById
  Gen->>Man: manualGenerateRenewalNow(cycleKey, period from cycle row)
  Man->>Man: ensureJobForManualGenerate(cycleKey from cycle, NOT next_billing)
  Man->>Job: insertOrReactivateRenewalJob
  Man->>W: sync worker pipeline (manualExecution=true)
  Note over W: Same complete/advance/dual-write as automatic
```

**Key:** Manual path uses **cycle row dates**, not subscription `next_billing_date`, for invoice competence. Mismatch guard still applies at worker pickup if subscription pointer diverged.

---

## 3. CRM PATCH next billing — invalidates queued work

```mermaid
sequenceDiagram
  autonumber
  participant User as CRM user
  participant Patch as patchCustomerSubscriptionNextBilling
  participant Sub as subscriptions
  participant Cancel as cancelPendingRenewalJobsForSubscription
  participant Job as billing_recurring_jobs
  participant Cyc as subscription_cycles
  participant Enq as tryEnqueueRenewalJobForSubscriptionId

  User->>Patch: next_billing_date = NEW
  Patch->>Sub: UPDATE next_billing_date
  Patch->>Cancel: cancel pending jobs (old cycle)
  Cancel->>Job: status=cancelled (manual_next_billing_reschedule)
  Cancel->>Cyc: subscriptionCyclesOnJobCancelled (old cycle → cancelled)
  Patch->>Enq: enqueue for NEW
  alt window open
    Enq->>Job: insert pending NEW
    Enq->>Cyc: upsert NEW queued
  else window blocked
    Note over Job: queue empty until scheduler
  end
```

---

## 4. Race — mismatch cancel (worker vs PATCH)

```mermaid
sequenceDiagram
  autonumber
  participant Sch as Scheduler
  participant Patch as CRM PATCH
  participant Job as Job cycle=A
  participant Sub as subscriptions
  participant W as Worker
  participant Cyc as subscription_cycles

  Sch->>Job: pending A
  Patch->>Sub: next_billing=B
  Patch->>Job: cancel pending (intended)
  alt job A still pending (race)
    W->>Job: pickup A
    W->>Sub: read next_billing=B
    W->>Job: cancel mismatch outcome
    W->>Cyc: cycle A → cancelled (guard: B≠A)
    W->>W: insertOrReactivateRenewalJob(B) attempt
  end
```

---

## 5. Three actors modifying same cycle — proof table

| Time | Scheduler | Worker | Manual Generate | Effective state |
|------|-----------|--------|-----------------|-----------------|
| T1 | Inserts job `pending` Jul | — | — | Job Jul pending; cycle Jul `queued` |
| T2 | Skipped (active exists) | Pickup Jul | — | Job Jul processing; cycle Jul `processing` |
| T3 | — | — | User Gerar Jul with `cycle_id` | `ensureJobForManualGenerate` → skipped_active or sync execute same job |
| T4 | — | Completes Jul | — | Job completed; cycle invoiced; next_billing → Aug |
| T5 | Enqueues Aug | — | — | New job Aug; cycle Aug `queued` |
| T4' | — | — | User Gerar Oct `cycle_id` while next=Aug | Manual creates/reactivates job for **Oct cycle row**; mismatch risk if next still Aug at pickup |

**Proof:** All three call `insertOrReactivateRenewalJob` or worker complete/cancel on the same `(subscription_id, normalized cycle_key)` guard. No separate code path bypasses dual-write.

---

## 6. SaaS vs CRM branch

| Type | Worker branch | Invoice table | Cycle status on complete |
|------|---------------|---------------|--------------------------|
| `customer` | `executeWorkerCrmRenewal` | `customer_invoices` | `invoiced` |
| `saas` | SaaS idempotent / tenant billing | `invoices` (tenant) | `skipped` (tenant_billing meta) |

---

## 7. Recovery loop (out of band)

```mermaid
sequenceDiagram
  participant Rec as billingRecoveryService
  participant Job as billing_recurring_jobs
  participant Cyc as subscription_cycles

  Rec->>Job: reclaim stale processing → pending
  Rec->>Cyc: processing → queued (orphan heal)
  Rec->>Job: reactivate stale pending
```

Does not create new competencies — only repairs stuck states.

---

## 8. Frontend runtime (non-billing, UX only)

```mermaid
sequenceDiagram
  participant API as GET subscription detail
  participant Raw as cycles_raw
  participant Store as FinancialEventStore
  participant Proj as buildProjectionEvents
  participant UI as Calendar / History

  API->>Raw: subscription_cycles rows
  Raw->>Store: realEvents (cycle_id required)
  Proj->>Store: projected events (no cycle_id)
  Store->>UI: mergeRealAndProjectionEvents
  Note over UI: Gerar only if cycle_id present (4.2G/J)
```

Frontend sequences **never** write to `subscription_cycles` or jobs.

---

## File map

| Phase | Primary file |
|-------|--------------|
| Scheduler | `recurringBillingJobService.ts` — `enqueueRenewalJobs`, `insertOrReactivateRenewalJob` |
| Worker batch | `recurringBillingJobService.ts` — `processBillingRecurringJobBatch` |
| CRM engine | `workerCrmRenewalPipeline/workerCrmRenewalPipeline.ts` |
| Persist complete/cancel | `billingRecurringJobPersistence.ts` |
| Cycle dual-write | `subscriptionCyclesDualWriteService.ts` |
| Manual | `billingManualRenewalService.ts`, `billingCycleInvoiceGenerationService.ts` |
| PATCH | `customerInvoiceRecurrenceNextBillingService.ts` |
| Recovery | `billingRecoveryService.ts` |
