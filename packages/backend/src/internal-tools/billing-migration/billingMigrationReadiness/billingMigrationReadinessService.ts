/**
 * Billing Engine V2 — Sprint 2.3E: serviço Migration Readiness (APIs).
 */
import { BillingMigrationReadinessEngine } from './billingMigrationReadinessEngine.js';
import { billingMigrationReadinessRepository } from './billingMigrationReadinessRepository.js';
import { getMigrationReadinessHealthStats } from './migrationReadinessMetrics.js';
import type {
  BillingMigrationReadinessReport,
  MigrationReadinessDashboard,
  MigrationReadinessHealthStats,
} from './types.js';

const REPORT_TTL_DAYS = 90;

export async function evaluateTenantMigrationReadiness(
  tenantId: string,
  options?: { persist?: boolean }
): Promise<BillingMigrationReadinessReport> {
  const report = await BillingMigrationReadinessEngine.evaluateTenant(tenantId);
  if (options?.persist !== false) {
    await billingMigrationReadinessRepository.insert(report);
    void billingMigrationReadinessRepository.purgeOlderThan(REPORT_TTL_DAYS).catch(() => {});
  }
  return report;
}

export async function getMigrationReadinessReportForTenant(
  tenantId: string
): Promise<{ report: BillingMigrationReadinessReport | null; from_cache: boolean }> {
  const row = await billingMigrationReadinessRepository.findLatestByTenant(tenantId);
  if (!row) {
    return { report: null, from_cache: false };
  }
  const report = row.report_json as BillingMigrationReadinessReport;
  return { report, from_cache: true };
}

export async function getMigrationReadinessDashboard(): Promise<MigrationReadinessDashboard> {
  const [stats, candidates, topProblems] = await Promise.all([
    billingMigrationReadinessRepository.getDashboardStats(),
    billingMigrationReadinessRepository.getMigrationCandidates(10),
    billingMigrationReadinessRepository.getTopProblems(5),
  ]);

  return {
    total_tenants: stats.total_tenants,
    ready: stats.ready,
    not_ready: stats.not_ready,
    average_score: stats.average_score,
    critical_issues: stats.critical_issues,
    top_problems: topProblems,
    migration_candidates: candidates,
    last_evaluation: stats.last_evaluation,
  };
}

export function getBillingMigrationReadinessHealthStats(): MigrationReadinessHealthStats {
  return getMigrationReadinessHealthStats();
}
