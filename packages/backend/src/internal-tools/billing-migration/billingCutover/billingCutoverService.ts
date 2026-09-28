/**
 * Billing Engine V2 — Sprint 2.3G: serviço Cutover Orchestrator (APIs).
 */
import { BillingCutoverOrchestrator } from './billingCutoverOrchestrator.js';
import { billingCutoverRepository } from './billingCutoverRepository.js';
import { getCutoverHealthStats } from './cutoverMetrics.js';
import type { BillingCutoverReport, CutoverDashboard, CutoverHealthStats } from './types.js';

const REPORT_TTL_DAYS = 90;

export async function evaluateTenantCutover(
  tenantId: string,
  options?: { correlationId?: string; persist?: boolean }
): Promise<BillingCutoverReport> {
  const report = await BillingCutoverOrchestrator.evaluateTenant({
    tenantId,
    correlationId: options?.correlationId,
    persistUpstream: options?.persist !== false,
  });
  if (options?.persist !== false) {
    await billingCutoverRepository.insert(report);
    void billingCutoverRepository.purgeOlderThan(REPORT_TTL_DAYS).catch(() => {});
  }
  return report;
}

export async function getCutoverReportForTenant(
  tenantId: string
): Promise<{ report: BillingCutoverReport | null; from_cache: boolean }> {
  const row = await billingCutoverRepository.findLatestByTenant(tenantId);
  if (!row) return { report: null, from_cache: false };
  return { report: row.report_json as BillingCutoverReport, from_cache: true };
}

export async function getCutoverDashboard(): Promise<CutoverDashboard> {
  const [stats, recent] = await Promise.all([
    billingCutoverRepository.getDashboardStats(),
    billingCutoverRepository.getRecent(10),
  ]);
  return {
    ready: stats.ready,
    blocked: stats.blocked,
    warnings: stats.warnings,
    average_score: stats.average_score,
    pending: stats.pending,
    candidates: stats.candidates,
    rollback_safe: stats.rollback_safe,
    shadow_healthy: stats.shadow_healthy,
    last_evaluation: stats.last_evaluation,
    recent,
  };
}

export function getBillingCutoverHealthStats(): CutoverHealthStats {
  return getCutoverHealthStats();
}
