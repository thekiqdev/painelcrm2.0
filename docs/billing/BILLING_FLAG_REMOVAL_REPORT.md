# Feature Flag Removal Report — Sprint 3.2B

## Removed

| Item | Location |
|------|----------|
| `BILLING_PLAN_V2` env | `config/billingEnv.ts` |
| `BILLING_PLAN_V2_SHADOW` env | `config/billingEnv.ts` |
| `isBillingPlanV2Enabled()` | deleted |
| `isBillingPlanV2ShadowEnabled()` | deleted |
| `getBillingShadowReportTtlDays()` | deleted (shadow archived) |
| `billing_plan_v2` / `billing_plan_v2_shadow` | `BillingExecutionContext.featureFlags` → `{}` |
| `LegacySubscriptionProvider` | `billingPlanProvider.ts` deleted |
| Shadow post-job calls | `recurringBillingJobService.ts` |

## Tests removed

- `billingPlanFeatureFlag.test.ts`
- `billingPlanProvider.test.ts`

## Runtime behavior

CRM renewal **never depended** on these flags after Sprint 3.1 cutover. Removal is safe with **no billing calculation change**.

## Archived references

Historical strings may remain in `internal-tools/billing-migration/` (read-only tooling).
