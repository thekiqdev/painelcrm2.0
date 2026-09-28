/**
 * Sprint 4 — métricas DEV CRM detail projection.
 */

export type CrmDetailProjectionMetricsSnapshot = {
  crm_detail_reconcile_total: number;
  crm_detail_cleared_by_sot_total: number;
  crm_detail_fetch_scheduled_total: number;
  crm_detail_stale_ignored_total: number;
};

const state: CrmDetailProjectionMetricsSnapshot = {
  crm_detail_reconcile_total: 0,
  crm_detail_cleared_by_sot_total: 0,
  crm_detail_fetch_scheduled_total: 0,
  crm_detail_stale_ignored_total: 0,
};

export function recordCrmDetailReconcile(by = 1): void {
  state.crm_detail_reconcile_total += by;
}

export function recordCrmDetailClearedBySot(by = 1): void {
  state.crm_detail_cleared_by_sot_total += by;
}

export function recordCrmDetailFetchScheduled(by = 1): void {
  state.crm_detail_fetch_scheduled_total += by;
}

export function recordCrmDetailStaleIgnored(by = 1): void {
  state.crm_detail_stale_ignored_total += by;
}

export function getCrmDetailProjectionMetricsSnapshot(): Readonly<CrmDetailProjectionMetricsSnapshot> {
  return { ...state };
}

export function resetCrmDetailProjectionMetricsForTests(): void {
  state.crm_detail_reconcile_total = 0;
  state.crm_detail_cleared_by_sot_total = 0;
  state.crm_detail_fetch_scheduled_total = 0;
  state.crm_detail_stale_ignored_total = 0;
}
