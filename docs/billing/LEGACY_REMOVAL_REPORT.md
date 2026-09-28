# Billing Engine 3.0 — Legacy Removal Report

**Sprint:** 3.2  
**Date:** 2026-06-26  
**Milestone:** Billing Engine 3.0 — General Availability

## Objective

Remove the legacy invoice-copy renewal engine and consolidate **Billing Engine 3.0** as the sole CRM billing architecture.

## Removed modules

| Module | Status |
|--------|--------|
| `executeCustomerRenewal.ts` | Removed |
| `crmRenewalCustomerResolver.ts` (+ tests) | Removed |
| `crmSubscriptionContractRenewalOverlay.ts` | Removed |
| `buildBillingItemsFromInvoice()` (`billingPlanItems/factory.ts`) | Removed |
| `billingEngineV2/` | Renamed → `billingEngine/` |
| `billingPersistence/` | Renamed → `billingExecution/` |

## Namespace consolidation

| Before | After |
|--------|-------|
| `BillingEngineV2` | `BillingEngine` |
| `billingEngineV2/` | `billingEngine/` |
| `billingPersistence/` | `billingExecution/` |
| `BillingPersistenceOrchestrator` | `BillingExecutionOrchestrator` |

## Preserved (non-renewal)

- **Contract metadata parsing** moved to `crmContractMetadata.ts` (parse + open-invoice sync helpers).
- **SaaS renewals** still use `BillingRenewalEngine` → `executeSaasRenewal`.
- **Deprecated DB values** (`legacy_invoice_copy`) detected via `deprecatedBillingStrategies.ts` and rejected at context/engine boundaries.

## Verification

Automated guard: `packages/backend/src/billingEngine/legacyRemovalVerification.test.ts`

- Confirms removed files/directories absent.
- Scans production `.ts` sources for prohibited legacy symbols.
- Asserts `BillingEngine` and `BillingExecutionOrchestrator` exports.

## Diagnosis changes

- `renewalDiagnosisService` resolves readiness via **billing plan** (`resolvePlanAndItems`), not prior invoice template.
- Manual renewal readiness uses `billing_plan.present` instead of `invoice.template_resolvable`.

## Build & tests

- `npm run build` — clean
- Regression suites: billing engine, execution orchestrator, worker pipeline, observability, pipeline certification, contract service, plan/items

## Success criteria

| Criterion | Status |
|-----------|--------|
| Legacy motor removed | ✅ |
| Single CRM engine (`BillingEngine`) | ✅ |
| Namespace simplified | ✅ |
| Build clean | ✅ |
| Tests passing | ✅ |
| Documentation updated | ✅ |
