/**
 * Log estruturado para operações de billing (Fase 3 / pós-auditoria).
 * Centralizado para uso em recurringBillingJobService, invoiceService e customerInvoiceService.
 */
export function billingLog(
  type: 'scheduler' | 'worker' | 'job' | 'invoice' | 'reconciliation',
  message: string,
  metrics?: Record<string, number | string | boolean | undefined>
): void {
  const payload = { type, message, ...metrics, ts: new Date().toISOString() };
  console.log('[BILLING]', JSON.stringify(payload));
}

/** Tags de investigação recorrência (não substituem `[BILLING]` existentes). */
export type SubscriptionBillingLogStage =
  | 'SUBSCRIPTION_BILLING'
  | 'SUBSCRIPTION_ELIGIBLE'
  | 'SUBSCRIPTION_PROCESSING'
  | 'SUBSCRIPTION_PENDING_CREATED'
  | 'SUBSCRIPTION_INVOICE_CREATED'
  | 'SUBSCRIPTION_INVOICE_FAILED'
  | 'SUBSCRIPTION_GATEWAY_FAILED';

/**
 * Logs temporários/estruturados para diagnóstico de assinaturas recorrentes.
 * Ativar análise em produção via agregador em `[SUBSCRIPTION_*]`.
 */
export function subscriptionBillingLog(
  stage: SubscriptionBillingLogStage,
  message: string,
  fields?: Record<string, number | string | boolean | null | undefined>
): void {
  const payload = {
    stage,
    message,
    execution_at: new Date().toISOString(),
    ...fields,
  };
  console.log(`[${stage}]`, JSON.stringify(payload));
}

/** Notificação quando um job de cobrança falha definitivamente. */
export function notifyBillingJobFailed(
  jobId: string,
  subscriptionId: string,
  tenantId: string,
  errorMessage: string
): void {
  billingLog('job', 'Billing job failed (max attempts)', {
    jobId,
    subscriptionId,
    tenantId,
    error: errorMessage,
    notify: true,
  });
}
