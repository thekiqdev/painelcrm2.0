# Billing Engine 3.0 — Dependency Graph

## CRM renewal (production)

```mermaid
flowchart TD
  W[recurringBillingJobService] --> WP[workerCrmRenewalPipeline]
  WP --> CTX[BillingExecutionContextBuilder]
  CTX --> PIR[planItemResolver]
  PIR --> BPR[billingPlanRepository]
  PIR --> BPIR[billingPlanItemRepository]
  CTX --> GUARD[contextIndependenceGuard]
  WP --> ENG[BillingEngine]
  ENG --> PROJ[billingProjectionEngine]
  WP --> ORCH[BillingExecutionOrchestrator]
  ORCH --> ENG
  ORCH --> INV[invoicePersistenceService]
  ORCH --> GW[gatewayExecutionService]
  ORCH --> NTF[notificationExecutionService]
  ORCH --> TL[timelineExecutionService]
  ORCH --> HIST[historyExecutionService]
  ORCH --> ADV[subscriptionCycleService]
  WP --> OBS[billingObservability]
```

## SaaS renewal (parallel path)

```mermaid
flowchart LR
  W2[recurringBillingJobService] --> BRE[BillingRenewalEngine]
  BRE --> SAAS[executeSaasRenewal]
```

## Removed dependencies (must not reappear)

```
executeCustomerRenewal
crmRenewalCustomerResolver
crmSubscriptionContractRenewalOverlay
buildBillingItemsFromInvoice
billingEngineV2/*
billingPersistence/*
```

## Shared infrastructure

| Consumer | Dependency |
|----------|------------|
| Worker | `billingRecurringJobPersistence`, `billingLogger` |
| Orchestrator | `customerInvoiceService`, gateway adapters |
| Diagnosis | `resolvePlanAndItems`, `recurringBillingJobService` |
| Contract patch | `crmContractMetadata` (no renewal overlay) |

## Public exports

- `billingEngine/index.ts` → `BillingEngine`, builders, `BILLING_ENGINE_VERSION`
- `billingExecution/index.ts` → `BillingExecutionOrchestrator`, `EXECUTION_ORCHESTRATOR_VERSION`
