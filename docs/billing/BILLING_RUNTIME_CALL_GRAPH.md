# Billing Runtime Call Graph — Sprint 4.1J

Pipeline único: **`billing_renewal_unified`**

## Generate Now (manual)

```
POST /api/crm-subscriptions/:id/manual-renew
  → crmSubscriptionsController
  → billingManualRenewalService.manualGenerateRenewalNow()
  → assessManualGenerateUnblocked()          [renewalDiagnosisService]
  → ensureJobForManualGenerate()
  → executeRenewalJobSynchronously()         [recurringBillingJobService]
  → BillingRenewalEngine.execute()           [NÃO ALTERADO — engine]
  → billingRecurringJobPersistence.completeBillingRecurringJob()
  → subscriptionCyclesDualWriteService       [cycles]
  → guardBillingQueryParams()                [pool.query]
```

## Worker automático

```
runRecurringWorker.ts
  → recurringBillingJobService.pickAndExecuteRenewalJob()
  → executeRenewalJobSynchronously()         [mesmo entrypoint manual]
  → (pipeline idêntico acima)
```

## Scheduler / Cron

```
runRecurringScheduler.ts
  → recurringBillingJobService.enqueueDueRenewals()
  → insertOrReactivateRenewalJob()
  → subscriptionCyclesUpsertAfterScheduler()
  → guardBillingQueryParams()
```

## Retry

```
Worker failed attempt
  → subscriptionCyclesOnJobFailedAttempt()   [pending se recuperável]
  → job status pending + retry_at
  → re-pick → executeRenewalJobSynchronously() [mesmo pipeline]
```

## Advance Cycle (pós-invoice)

```
completeBillingRecurringJob()
  → advanceSubscriptionAfterCompletedCycle()
  → computeFinalNextBillingForCompletedCycle()  [normalizeBillingDateFromDb]
  → updateSubscriptionAfterRenewal()
```

## Alterar vencimento

```
PATCH next_billing_date
  → billingSubscriptionService.patchSubscriptionBillingDates()
  → renewalValidationPipeline.repairSubscriptionDates()
  → assertBillingDate via guard
```

## Provision / Repair / Synchronize

```
getCrmSubscriptionDetail()
  → validateBillingRuntime()
      → repairRecoverableSubscriptionCycles()
      → repairBillingPlanForSubscription()
      → auditCycleConsistency()
  → billingPlanSynchronizationService (on-demand)
```

## Persistência (todas as rotas)

```
pool.query()
  → guardBillingQueryParams()
  → auditSqlDateParams() + traceBillingSqlWrite()
  → PostgreSQL
```

_Nenhum fork de pipeline — manual, worker, retry e scheduler convergem em `executeRenewalJobSynchronously`._
