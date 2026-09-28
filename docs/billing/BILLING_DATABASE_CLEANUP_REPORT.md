# Database Cleanup Report — Sprint 3.2B

## Migration

**File:** `database/init/290_billing_strategy_ga_cleanup.sql`

| Change | Before | After |
|--------|--------|-------|
| `billing_strategy` DEFAULT | `legacy_invoice_copy` | `billing_plan_items` |
| CHECK constraint | includes `legacy_invoice_copy` | `billing_plan_items`, `mixed`, `future` only |

## Application layer

- New plans: already defaulted to `billing_plan_items` (Sprint 3.2)
- Legacy rows: `deprecatedBillingStrategies.ts` rejects at context build
- **No application logic change** in this sprint

## Registered

Added to `migrationOrder.ts` before `create-admin-user.sql`.

## Note

Existing rows with `legacy_invoice_copy` remain in DB until manually migrated; runtime rejects them. Optional data migration is out of scope.
