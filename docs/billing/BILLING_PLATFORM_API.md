# Billing Platform — API

**Base URL:** `/api/billing-platform`  
**Auth:** `authenticateToken` + tenant context

## Endpoints

### `GET /api/billing-platform`

Platform manifest (version, modules, engine version).

### `GET /api/billing-platform/analytics`

Analytics snapshot stub for current tenant.

### `GET /api/billing-platform/reports`

List of report contracts (MRR, ARR, LTV, churn, etc.) — not yet implemented.

### `GET /api/billing-platform/forecast`

Forecast model stub (30d, 60d, 90d, 12m horizons).

### `GET /api/billing-platform/recovery`

Recovery architecture descriptor (capabilities disabled).

### `GET /api/billing-platform/events`

Registered event types + recent in-memory events.

### `GET /api/billing-platform/intelligence`

Intelligence profile stub (signals not implemented).

### `GET /api/billing-platform/automation`

Reference automation workflow contract.

### `GET /api/billing-platform/observability`

Bridge to existing `billingObservability` report.  
Query: `?audit=1` for operational audit (same as superadmin observability).

## Example

```http
GET /api/billing-platform
Authorization: Bearer <token>
```

```json
{
  "version": "v4_platform_foundation",
  "engine_version": "v3_billing_engine_ga",
  "modules": [...]
}
```

## Not in scope (Sprint 4.0)

- Mutations
- Webhooks
- Superadmin-only platform admin API
