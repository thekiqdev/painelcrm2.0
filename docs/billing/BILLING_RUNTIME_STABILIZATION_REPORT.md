# BILLING_RUNTIME_STABILIZATION_REPORT

**Sprint:** 4.0A.1 — Runtime Stabilization  
**Data:** 2026-06-30  
**Veredito:** `RUNTIME_STABILIZED`

## Problemas corrigidos

| Sintoma | Causa raiz | Correção |
|---------|------------|----------|
| `column "tenant_id" does not exist` | `clients` não possui `tenant_id`; isolamento via `users.tenant_id` | JOIN `users` em `billingExecutionContextBuilder.loadCustomer` e `mercadoPagoCustomerInvoicePaymentService.fetchClientPayer` |
| `BILLING_PLAN_NOT_FOUND` em assinaturas CRM | Planos/itens ausentes ou janela `effective_from` inelegível; transação sem RLS | `runProvisionTransaction` + repair de janela efetiva + validação pós-provision com retry |
| Provision falha silenciosa em API | `pool.connect()` fora do contexto RLS do tenant | Transações via `withTenantRlsContext` / client do worker com bypass |

## Fluxo validado

```
Subscription → ensureBillingPlan() → repair/provision → validate → BillingExecutionContextBuilder → Engine
```

## Definition of Done

| Item | Status |
|------|--------|
| Novas assinaturas geram Billing Plan automaticamente | ✅ |
| Assinaturas antigas reparadas no worker | ✅ |
| `BILLING_PLAN_NOT_FOUND` eliminado no caminho feliz | ✅ |
| Erro `tenant_id` em `clients` eliminado | ✅ |
| Worker inalterado estruturalmente | ✅ |
| Build + testes ≥35 | ✅ |
