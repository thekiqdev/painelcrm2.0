# Billing 2.0 — Correlation ID (Sprint 0)

Padrão canônico para logs, audit e policy nas sprints seguintes.

| Contexto | Formato | Helper |
|----------|--------|--------|
| Renovação / ciclo | `saas_renew:{subscriptionId}:{periodStartYmd}` | `billingRenewalCorrelationId` |
| Fatura plataforma | `tenant_billing:{billingId}` | `tenantBillingCorrelationId` |
| Job recorrente | `billing_job:{jobId}` | `billingJobCorrelationId` |
| Tentativa de pagamento | `tb_attempt:{attemptId}` | `tenantBillingAttemptCorrelationId` |

**Código:** `packages/backend/src/services/billing2/billingCorrelationId.ts`

**Nota Sprint 0:** helpers existem; o motor de renovação **ainda não** foi alterado para emití-los (evita mudança de comportamento). Uso obrigatório a partir da Sprint 1/3 conforme o plano.
