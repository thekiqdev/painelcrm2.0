# Billing Engine 3.0 — Architecture

**Version:** 3.0 GA  
**Date:** 2026-06-26

## Overview

Billing Engine 3.0 is the official CRM recurring billing stack. It generates invoices exclusively from **persisted Billing Plans** and **Billing Plan Items**. The legacy flow that copied line items from prior `customer_invoices` rows is fully removed.

## CRM renewal pipeline

```
Worker (recurringBillingJobService)
  └─ executeWorkerCrmRenewal
       ├─ BillingExecutionContextBuilder
       ├─ BillingEngine              (pure generation)
       └─ BillingExecutionOrchestrator (side effects)
            ├─ Invoice persistence
            ├─ Gateway
            ├─ Notifications
            ├─ Timeline
            ├─ History
            └─ Subscription cycle advance
```

## Module map

| Layer | Path | Responsibility |
|-------|------|----------------|
| Context | `billingExecutionContext/` | Plan + items resolution, certification |
| Engine | `billingEngine/` | Draft invoice/items, gateway/notification payloads |
| Execution | `billingExecution/` | Persist + integrate with external systems |
| Worker glue | `services/workerCrmRenewalPipeline/` | Job lifecycle + observability hooks |
| Observability | `billingObservability/` | Metrics, health, profiler |
| SaaS (unchanged) | `services/billingRenewalEngine/` | SaaS-only `executeSaasRenewal` |

## Data model

- **Source of truth:** `billing_plans` + `billing_plan_items`
- **Output:** `customer_invoices` + `customer_invoice_items` (generated, not templated)
- **Contract overlay on renewal:** removed; contract changes sync open invoices + metadata for future plan revisions

## Guards

- `contextIndependenceGuard` — rejects virtual items, deprecated strategies, legacy metadata markers
- `billingEngineContextGuard` — requires certified, persisted-plan context
- `deprecatedBillingStrategies.ts` — centralizes detection of legacy DB enum values

## Version constants

- `BILLING_ENGINE_VERSION` = `v3_billing_engine_ga`
- `EXECUTION_ORCHESTRATOR_VERSION` = `v3_execution_orchestrator_ga`

## What is NOT in scope

- Database schema migrations (Sprint 3.2: `database_changes: false`)
- SaaS billing pipeline refactor
- Billing Intelligence Platform (Sprint 4.0)
