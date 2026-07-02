# Billing Platform — Modules

| Module | Path | Status | Notes |
|--------|------|--------|-------|
| Engine | `billingEngine/` | GA | Invoice generation — **not in billingPlatform/** |
| Execution | `billingExecution/` | GA | Side effects — **not in billingPlatform/** |
| Plans | `billingPlan/`, `billingPlanItems/` | GA | Existing |
| Analytics | `billingPlatform/analytics/` | Foundation | Metric contracts |
| Intelligence | `billingPlatform/intelligence/` | Foundation | Signal stubs |
| Forecast | `billingPlatform/forecasting/` | Foundation | 30d–12m horizons |
| Recovery | `billingPlatform/recovery/` | Foundation | Dunning architecture |
| Automation | `billingPlatform/automation/` | Foundation | Workflow contracts |
| Reports | `billingPlatform/reports/` | Foundation | MRR, ARR, LTV, etc. |
| Events | `billingPlatform/events/` | Foundation | In-memory bus |
| API | `billingPlatform/api/` | Foundation | REST scaffold |
| Shared | `billingPlatform/shared/` | Foundation | Observability bridge |
| Observability | `billingObservability/` | GA | Reused via bridge |

## Version constant

```typescript
BILLING_PLATFORM_VERSION = 'v4_platform_foundation'
```

## Public export

```typescript
import { getBillingPlatformManifest, BILLING_PLATFORM_VERSION } from './billingPlatform/index.js';
```
