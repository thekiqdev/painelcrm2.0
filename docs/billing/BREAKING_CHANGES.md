# Billing Engine 3.0 — Breaking Changes

**Sprint:** 3.2  
**Effective:** 2026-06-26

## Summary

This release removes all legacy CRM renewal code paths. Any integration that depended on invoice-copy renewal or pre-3.0 module names **must migrate**.

## Removed APIs

| Removed | Replacement |
|---------|-------------|
| `executeCustomerRenewal()` | `executeWorkerCrmRenewal()` |
| `resolveCrmRenewalPreviousInvoice()` | `resolvePlanAndItems()` |
| `overlayCrmContractOnRenewalItems()` | Billing plan items + contract metadata on subscription |
| `buildBillingItemsFromInvoice()` | Persist items on `billing_plan_items` |
| `BillingEngineV2` | `BillingEngine` |
| `BillingPersistenceOrchestrator` | `BillingExecutionOrchestrator` |

## Import path changes

```diff
- from '../billingEngineV2/billingEngineV2.js'
+ from '../billingEngine/billingEngine.js'

- from '../billingPersistence/billingPersistenceOrchestrator.js'
+ from '../billingExecution/billingExecutionOrchestrator.js'
```

## Behavioral changes

1. **CRM renewals via `BillingRenewalEngine.execute()`** — throws `crm_use_worker_v2_pipeline`. Use the worker pipeline only.
2. **Diagnosis** — `billing_plan.present` is authoritative; `invoice.template_resolvable` is deprecated.
3. **Manual renewal readiness** — blocked when billing plan/items missing, not when prior invoice missing.
4. **New billing plans** — default `billing_strategy: billing_plan_items`, `engine_version: v2`.
5. **Legacy strategy rows** — `legacy_invoice_copy` plans are rejected at context build (existing DB rows may need migration).

## Unchanged

- SaaS renewal (`executeSaasRenewal`)
- Database schema (no migrations in 3.2)
- Superadmin observability route: `GET /api/superadmin/billing/v2-observability` (name retained for API stability)

## Upgrade checklist

- [ ] Remove imports of deleted modules
- [ ] Rename `BillingEngineV2` → `BillingEngine`
- [ ] Rename orchestrator imports to `billingExecution/`
- [ ] Ensure subscriptions have active `billing_plans` + items before renewal
- [ ] Update operational runbooks to reference Billing Engine 3.0 flow
