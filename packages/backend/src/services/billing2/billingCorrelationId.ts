/**
 * Billing 2.0 — Correlation ID (Sprint 0).
 *
 * Padrão documentado no Implementation Plan / PRD §17 (auditabilidade).
 * Helpers puros; Sprint 0 não altera o motor de renovação — apenas padroniza o contrato
 * para Sprints seguintes (logs, audit, policy).
 *
 * Formatos canônicos:
 * - Ciclo de renovação: `saas_renew:{subscriptionId}:{periodStartYmd}`
 * - Fatura: `tenant_billing:{billingId}`
 * - Job: `billing_job:{jobId}`
 * - Tentativa de pagamento: `tb_attempt:{attemptId}`
 */

export type BillingCorrelationKind =
  | 'saas_renew'
  | 'tenant_billing'
  | 'billing_job'
  | 'tb_attempt';

/** Correlation id de um ciclo de renovação SaaS (alinhado à idempotencyKey de charge). */
export function billingRenewalCorrelationId(subscriptionId: string, periodStartYmd: string): string {
  return `saas_renew:${subscriptionId}:${periodStartYmd}`;
}

export function tenantBillingCorrelationId(billingId: string): string {
  return `tenant_billing:${billingId}`;
}

export function billingJobCorrelationId(jobId: string): string {
  return `billing_job:${jobId}`;
}

export function tenantBillingAttemptCorrelationId(attemptId: string): string {
  return `tb_attempt:${attemptId}`;
}

/**
 * Campos mínimos recomendados em logs/audit Billing 2.0.
 * Não substituem `billingLog` existente — complementam em sprints futuras.
 */
export type Billing2CorrelationFields = {
  correlation_id: string;
  subscription_id?: string;
  billing_id?: string;
  job_id?: string;
  period_start?: string;
  tenant_id?: string;
};
