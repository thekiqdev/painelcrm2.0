# Billing Subscription Audit — Sprint 4.2

## Escopo

Auditoria de **todas** as assinaturas `subscriptions.type = 'customer'`.

## Validações

- Billing Plan ativo e items
- `next_billing_date` válido (ativas)
- Cycles: duplicados, overlap, órfãos
- Invoices: órfãs, inconsistência com cycles
- Jobs: stuck processing, failed recoverable
- Status de assinatura válido

## Implementação

`packages/backend/src/billingPlatform/audit/productionSubscriptions/productionSubscriptionAuditor.ts`

Delega reparo a `validateBillingRuntime()`.

## Reparo automático

- `repairRecoverableSubscriptionCycles`
- `repairBillingPlanForSubscription`
- Reset de jobs stuck (>30min processing)
