# Billing Engine 3.0 — Operational Runbook

## CRM renewal pipeline

```
Worker → BillingExecutionContext → BillingEngine → BillingExecutionOrchestrator
```

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /api/superadmin/billing/health` | Recovery snapshot |
| `GET /api/superadmin/billing/observability` | Metrics + dashboard (GA) |
| `GET /api/superadmin/billing/engine-health` | Deep diagnostic |

Deprecated alias: `/billing/v2-observability` → same handler.

## Common blockers

| Code | Meaning |
|------|---------|
| `BILLING_PLAN_NOT_FOUND` | No active `billing_plans` row |
| `BILLING_ITEMS_NOT_FOUND` | No effective `billing_plan_items` |
| `LEGACY_PLAN_STRATEGY` | Deprecated `billing_strategy` in DB |
| `crm_use_worker_v2_pipeline` | CRM called legacy `BillingRenewalEngine` (blocked) |

## Manual renewal

Uses same worker pipeline with `manualExecution: true`.

## Logs

- `[BILLING_ENGINE]` — invoice generation
- `[EXECUTION_ORCHESTRATOR]` — persistence + side effects
- `[WORKER]` / `[WORKER_ENGINE]` — CRM worker pipeline

## Version constants

- `BILLING_ENGINE_VERSION` = `v3_billing_engine_ga`
- `EXECUTION_ORCHESTRATOR_VERSION` = `v3_execution_orchestrator_ga`
- `BILLING_OBSERVABILITY_VERSION` = `v3_observability_ga`
