# Billing Migration Certification — Sprint 4.2

## Objetivo

Nenhuma assinatura antiga depende de migração manual de Billing Plan/Items.

## Validação

- Assinaturas ativas/pausadas sem `billing_plans` ativo
- Plans sem `billing_plan_items`

## Reparo automático

`repairBillingPlanForSubscription()` para cada assinatura afetada.

## Módulo

`audit/migration/migrationCertification.ts`
