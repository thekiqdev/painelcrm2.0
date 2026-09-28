# BILLING_PROVISION_RUNTIME_REPORT

**Sprint:** 4.0A.1

## BillingPlanProvisionService — runtime

### `ensureBillingPlan`
1. Valida plano + itens efetivos
2. Se inválido → `provision()` transacional (`runProvisionTransaction`)
3. Sincroniza contrato (opcional)
4. Revalida; se ainda inválido → `repair()` automático
5. Falha apenas se reparo impossível

### `repair`
- Reativa `draft`
- Duplica `archived` → nova versão ativa
- Cria plano + itens se inexistente
- **Novo:** ajusta `effective_from` quando itens existem mas não são efetivos (evita violação UNIQUE)

### Observability

Métricas:
- `billing_plan_created`, `billing_plan_repaired`
- `billing_items_created`, `billing_items_repaired`
- `provision_runtime_errors`, `provision_sql_errors`, `tenant_resolution_errors`

Dashboard: `GET /api/billing-platform/observability` → `provision_health`

## Integrações

| Ponto | Hook |
|-------|------|
| Criação CRM (`createRecurringManualInvoice`) | `ensureBillingPlan` + rollback subscription |
| Worker CRM | `ensureBillingPlan` antes do context builder (Sprint 4.0A) |
| Edição contrato | `ensureBillingPlan` após apply |

## Logs

`[BILLING_PROVISION]`, `[BILLING_REPAIR]`, `[BILLING_SYNCHRONIZE]`, `[BILLING_VALIDATE]`
