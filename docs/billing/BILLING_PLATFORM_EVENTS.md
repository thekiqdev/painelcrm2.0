# Billing Platform — Events

## Event types

| Event | Typical payload |
|-------|-----------------|
| `InvoiceGenerated` | `tenant_id`, `invoice_id`, `subscription_id`, `amount_cents` |
| `InvoicePaid` | `invoice_id`, `amount_cents` |
| `InvoiceExpired` | `invoice_id` |
| `SubscriptionRenewed` | `subscription_id`, `invoice_id` |
| `SubscriptionCancelled` | `subscription_id` |
| `PlanChanged` | `subscription_id`, metadata |
| `ChargeSucceeded` | `invoice_id`, gateway metadata |
| `ChargeFailed` | `invoice_id`, failure reason |

## Bus API (foundation)

```typescript
import {
  publishBillingPlatformEvent,
  subscribeBillingPlatformEvent,
} from './billingPlatform/events/index.js';

publishBillingPlatformEvent({
  type: 'InvoiceGenerated',
  payload: {
    tenant_id: '...',
    invoice_id: '...',
    occurred_at: new Date().toISOString(),
  },
});
```

## Sprint 4.0 scope

- In-memory only (max 500 recent events)
- **No** mandatory consumers
- **No** wiring from Billing Engine (future sprint)

## Future

- Persistent event store
- Webhooks for tenants
- Automation triggers
