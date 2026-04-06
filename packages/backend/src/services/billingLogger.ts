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
