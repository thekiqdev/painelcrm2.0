# Sprint N.1 — Recurring Billing Notifications Hard Fix

## Objetivo

Garantir envio confiável de **WhatsApp** e **E-mail** para faturas SaaS recorrentes (`tenant_billing`, `billing_reason = plan_renewal`), sem depender de `setImmediate` no billing-worker.

## Problema (N.0 / AUDIT)

O worker `runRecurringWorker.ts` chamava `schedulePublishPlatformBillingChargeCreated` (`setImmediate`). O processo one-shot encerrava antes de `publishPlatformBillingChargeCreated` completar → `platform_notification_deliveries` vazio.

## Correção

### 1. Publicação síncrona na renovação

**Arquivo:** `packages/backend/src/services/recurringBillingJobService.ts`  
**Função:** `processOneRenewalJob()`

```typescript
if (!zeroSettlement) {
  await publishPlatformBillingChargeCreated(billing.id);
}
```

`schedulePublishPlatformBillingChargeCreated()` **permanece** para fluxos HTTP (checkout, cobrança manual Superadmin).

### 2. Helper de recuperação

**Arquivo:** `packages/backend/src/services/platformNotifications/platformBillingChargeNotification.ts`

| Função | Papel |
|--------|-------|
| `listBillingChargeCreatedDeliveryChannels(billingId)` | Verifica canais em `platform_notification_deliveries` |
| `ensureBillingChargeNotificationExists(billingId)` | Republica se WhatsApp ou E-mail ausente |

Evento: `platform.billing.charge.created`  
Idempotência: engine existente (`idempotency_key` por canal) — republicar não duplica deliveries.

### 3. Replay idempotente

No path `completed_idempotent_existing_saas_invoice` (`findInvoiceBySubscriptionAndPeriod`):

```typescript
await ensureBillingChargeNotificationExists(existingInvoice.id);
```

Recupera renovações antigas que ficaram sem notificação.

### 4. Skip zero amount (M4)

`ensureBillingChargeNotificationExists` não republica faturas R$ 0 já liquidadas (`zero_amount` / `paid`), alinhado ao skip em `processOneRenewalJob` quando `zeroSettlement`.

## Escopo preservado (não alterado)

- Lifecycle / Kanban
- Commercial Overrides M1–M4
- Trial Recovery
- Platform Notification Engine (orquestrador, templates, repository)

## Testes

`packages/backend/src/services/platformNotifications/platformBillingChargeNotification.test.ts`

- Deliveries completas → sem republicação
- Deliveries ausentes → `publishPlatformBillingChargeCreated` uma vez
- Zero amount liquidado → skip
- Integração mockada: renovação → publish → whatsapp + email → idempotência no segundo call

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Renovação cria `tenant_billing` | ✓ (inalterado) |
| `platform_notification_deliveries` criada no worker | ✓ await síncrono |
| WhatsApp + E-mail | ✓ via `publishPlatformBusinessEventMultiChannel` |
| Não depende de `setImmediate` no worker | ✓ |
| Replay idempotente recupera notificações perdidas | ✓ `ensureBillingChargeNotificationExists` |
| Sem deliveries duplicadas | ✓ idempotency_key do engine |

## Referências

- `docs/architecture/billing/AUDIT_RECURRING_BILLING_NOTIFICATIONS.md`
- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`
