/**
 * Feature flags e limites do motor de billing / recorrência (Fase 9).
 * Defaults seguros: recursos ativos; desligar só em incidente ou rollout gradual.
 */

/** E2 — `processChildItemDueInvoices`. Desligar: `BILLING_CHILD_ITEM_INVOICES_ENABLED=false`. */
export function isChildItemInvoicesEnabled(): boolean {
  return process.env.BILLING_CHILD_ITEM_INVOICES_ENABLED !== 'false';
}

/** Itens processados por execução do worker (E2). Máx. 200. */
export function getChildBillingBatchLimit(): number {
  const raw = process.env.BILLING_CHILD_BATCH_LIMIT;
  if (raw == null || raw === '') return 50;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

/** Logs por assinatura no scheduler (`enqueue_job_inserted`, skips). Default: false (menos ruído em produção). */
export function isBillingSchedulerVerbose(): boolean {
  return process.env.BILLING_SCHEDULER_VERBOSE === 'true';
}

/**
 * Quando true, job `completed_no_invoice_no_eligible_items` também emite log `operational_alert`
 * com `notify: true` (útil para agregadores / alertas externos).
 */
export function shouldAlertNoInvoiceCycle(): boolean {
  return process.env.BILLING_ALERT_ON_NO_INVOICE_CYCLE === 'true';
}

/** Fase 0: logs diagnósticos de janela local por tenant (sem alterar elegibilidade real). */
export function isBillingTimeWindowVerbose(): boolean {
  return process.env.BILLING_TIME_WINDOW_VERBOSE === 'true';
}
