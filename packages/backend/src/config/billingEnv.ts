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
