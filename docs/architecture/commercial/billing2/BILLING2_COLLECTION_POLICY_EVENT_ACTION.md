# Collection Policy — Event → Action (Sprint 3)

**Status:** Interpretador + executores ativos **somente** com `collection_policy_engine_enabled=ON`.  
Default da flag: **OFF** → legado puro (sem mudança de produção).

```text
renewal.due / renewal.charge_created
payment.failed / payment.overdue / payment.paid
pix_automatic.* / grace.elapsed / cancel.threshold_elapsed
        │
        ▼
┌───────────────────────────┐
│ getActiveCollectionPolicy │  DB (S2) → memory defaults
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ interpretCollectionPolicy │  Event + policy → Actions[] (determinístico)
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ executeCollectionActions  │  notify_* | create_pix | reactivate |
│                           │  stubs: charge_card (S9) | pix_auto (S10) |
│                           │  suspend/cancel guardados por FF
└───────────────────────────┘
```

## Extension points

| Local | Evento | Comportamento com engine OFF | Com engine ON |
|-------|--------|------------------------------|---------------|
| `executeSaasRenewal` | `renewal.charge_created` | notify legado `publishPlatformBillingChargeCreated` | engine assume notify (legado skip) |
| `paymentDomainService` | `payment.paid` | só activate legado; hook no-op | + `reactivate_tenant` / audit |
| `syncOverdueBillingStatuses` | `payment.overdue` | notify overdue legado | engine assume notify; suspend/cancel só se policy+FF ON |

## Idempotência

`(entity, action, cycle_key, attempt)` → `idempotency_key` gravado em `billing_audit_events` (`collection_policy.action`).

## Defaults (PRD §18) — inalterados

| Campo / Flag | Default |
|--------------|---------|
| `collection_policy_engine_enabled` | OFF |
| renew_card_auto / `card_auto_renew` | OFF |
| generate_pix_auto | ON |
| pix_automatic | OFF |
| auto_suspend / auto_cancel | OFF |
| reactivate_on_paid / `auto_reactivate` | ON |
| notify whatsapp/email | ON |
| `past_due_writer_enabled` | OFF |

Código: `packages/backend/src/services/collectionPolicy/`
