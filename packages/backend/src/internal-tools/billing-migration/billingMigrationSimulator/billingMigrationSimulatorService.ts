/**
 * Billing Engine V2 — Sprint 2.3F: serviço Migration Simulator (APIs).
 */
import { BillingMigrationSimulatorEngine } from './billingMigrationSimulatorEngine.js';
import { billingMigrationSimulationRepository } from './billingMigrationSimulationRepository.js';
import { getMigrationSimulatorHealthStats } from './simulatorMetrics.js';
import type {
  BillingMigrationSimulationReport,
  MigrationSimulatorDashboard,
  MigrationSimulatorHealthStats,
} from './types.js';

const REPORT_TTL_DAYS = 90;

export function serializeSimulationDashboard(
  report: BillingMigrationSimulationReport
): Record<string, unknown> {
  return {
    tenant_id: report.tenant_id,
    tenant_name: report.tenant_name,
    overall_score: report.overall_score,
    recommended: report.recommended,
    risk: report.impact.risk,
    rollback_safe: report.rollback_safe,
    financial_impact: report.impact.financialImpact,
    notification_impact: report.impact.notificationImpact,
    gateway_impact: report.impact.gatewayImpact,
    timeline_impact: report.impact.timelineImpact,
    history_impact: report.impact.historyImpact,
    rollback_preview: report.rollback_preview,
    subscriptions_count: report.subscriptions.length,
    generated_at: report.generated_at,
  };
}

export async function runMigrationSimulation(
  tenantId: string,
  options?: { correlationId?: string; persist?: boolean; skipProjectionCache?: boolean }
): Promise<BillingMigrationSimulationReport> {
  const report = await BillingMigrationSimulatorEngine.simulateTenant({
    tenantId,
    correlationId: options?.correlationId,
    skipProjectionCache: options?.skipProjectionCache,
  });
  if (options?.persist !== false) {
    await billingMigrationSimulationRepository.insert(report);
    void billingMigrationSimulationRepository.purgeOlderThan(REPORT_TTL_DAYS).catch(() => {});
  }
  return report;
}

export async function getMigrationSimulationForTenant(
  tenantId: string
): Promise<{ report: BillingMigrationSimulationReport | null; from_cache: boolean }> {
  const row = await billingMigrationSimulationRepository.findLatestByTenant(tenantId);
  if (!row) return { report: null, from_cache: false };
  const report = row.simulation_json as BillingMigrationSimulationReport;
  return { report, from_cache: true };
}

export async function getMigrationSimulatorDashboard(): Promise<MigrationSimulatorDashboard> {
  const [stats, recent] = await Promise.all([
    billingMigrationSimulationRepository.getDashboardStats(),
    billingMigrationSimulationRepository.getRecentSimulations(10),
  ]);
  return {
    total_simulations: stats.total_simulations,
    average_score: stats.average_score,
    average_duration_ms: stats.average_duration_ms,
    high_risk: stats.high_risk,
    critical: stats.critical,
    ready_to_migrate: stats.ready_to_migrate,
    blocked: stats.blocked,
    last_simulation: stats.last_simulation,
    recent,
  };
}

export function getBillingMigrationSimulatorHealthStats(): MigrationSimulatorHealthStats {
  return getMigrationSimulatorHealthStats();
}
