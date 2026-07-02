/**
 * Billing Engine V2 — Sprint 3.1A: agrega métricas, health e dashboard do pipeline V2.
 */
import { getContextHealthStats } from '../billingExecutionContext/contextMetrics.js';
import { buildBillingHealthDashboard } from './billingHealthDashboard.js';
import type { BillingMetricsSnapshot } from './types.js';
import { getMetricsCollectorSnapshot } from './billingMetricsCollector.js';
import { runBillingOperationalAudit } from './billingOperationalAudit.js';
import {
  getAverageStageDurations,
  getRecentPerformanceProfiles,
} from './billingPerformanceProfiler.js';
import { logBillingObservability } from './observabilityLogger.js';
import type {
  BillingDashboardCard,
  BillingHealthCheck,
  BillingHealthSummary,
  BillingOperationalAuditReport,
  BillingPerformanceProfile,
  BillingPipelineStage,
} from './types.js';
import { BILLING_OBSERVABILITY_VERSION } from './types.js';
import { pool } from '../utils/db.js';

async function countOrphanJobs(): Promise<number> {
  const r = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM billing_recurring_jobs j
     LEFT JOIN subscriptions s ON s.id = j.subscription_id
     WHERE s.id IS NULL`
  );
  return Number(r.rows[0]?.count ?? 0);
}

function stageHealth(
  stage: BillingPipelineStage,
  metrics: BillingMetricsSnapshot,
  contextHealthy: boolean
): BillingHealthCheck {
  const now = new Date().toISOString();

  switch (stage) {
    case 'ExecutionContext': {
      const healthy = contextHealthy && metrics.context_errors === 0;
      return {
        stage,
        healthy,
        score: healthy ? 100 : metrics.context_errors > 5 ? 40 : 70,
        message: healthy ? 'Context builder operacional' : 'Erros no context builder',
        last_checked_at: now,
      };
    }
    case 'BillingEngine': {
      const healthy = metrics.engine_errors === 0;
      return {
        stage,
        healthy,
        score: healthy ? 100 : 50,
        message: healthy ? 'Engine V2 sem rejeições' : `${metrics.engine_errors} engine errors`,
        last_checked_at: now,
      };
    }
    case 'ExecutionOrchestrator': {
      const healthy = metrics.renewals_failed === 0 || metrics.renewals_success > metrics.renewals_failed;
      return {
        stage,
        healthy,
        score: healthy ? 100 : 60,
        message: 'Orchestrator executando renovações',
        last_checked_at: now,
      };
    }
    case 'Gateway': {
      const rate = metrics.gateway_success_rate;
      const healthy = rate === null || rate >= 85;
      return {
        stage,
        healthy,
        score: rate ?? 100,
        message: rate !== null ? `Gateway success ${rate}%` : 'Sem amostras gateway',
        last_checked_at: now,
      };
    }
    case 'Notifications': {
      const rate = metrics.notification_success_rate;
      const healthy = rate === null || rate >= 85;
      return {
        stage,
        healthy,
        score: rate ?? 100,
        message: rate !== null ? `Notification success ${rate}%` : 'Sem amostras notification',
        last_checked_at: now,
      };
    }
    case 'Timeline': {
      const rate = metrics.timeline_success_rate;
      const healthy = rate === null || rate >= 85;
      return {
        stage,
        healthy,
        score: rate ?? 100,
        message: rate !== null ? `Timeline success ${rate}%` : 'Sem amostras timeline',
        last_checked_at: now,
      };
    }
    case 'History': {
      const rate = metrics.history_success_rate;
      const healthy = rate === null || rate >= 85;
      return {
        stage,
        healthy,
        score: rate ?? 100,
        message: rate !== null ? `History success ${rate}%` : 'Sem amostras history',
        last_checked_at: now,
      };
    }
    case 'SubscriptionAdvance':
      return {
        stage,
        healthy: metrics.renewals_success > 0 || metrics.renewals_total === 0,
        score: 100,
        message: 'Advance integrado ao orchestrator',
        last_checked_at: now,
      };
    default:
      return { stage, healthy: true, score: 100, message: 'ok', last_checked_at: now };
  }
}

const PIPELINE_STAGES: BillingPipelineStage[] = [
  'ExecutionContext',
  'BillingEngine',
  'ExecutionOrchestrator',
  'Gateway',
  'Notifications',
  'Timeline',
  'History',
  'SubscriptionAdvance',
];

export type BillingObservabilityReport = {
  version: string;
  metrics: BillingMetricsSnapshot;
  dashboard: BillingDashboardCard[];
  health: BillingHealthSummary;
  performance: {
    recent_profiles: BillingPerformanceProfile[];
    average_stage_durations_ms: Record<string, number>;
  };
  audit?: BillingOperationalAuditReport;
};

export async function getBillingObservabilityReport(options?: {
  includeAudit?: boolean;
}): Promise<BillingObservabilityReport> {
  const orphanJobs = await countOrphanJobs();
  const metrics = getMetricsCollectorSnapshot(orphanJobs);
  const contextStats = getContextHealthStats();
  const checks = PIPELINE_STAGES.map((stage) =>
    stageHealth(stage, metrics, contextStats.healthy)
  );
  const overall_score =
    checks.length > 0 ? Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length) : 100;
  const healthy = checks.every((c) => c.healthy) && metrics.billing_plan_errors === 0;

  logBillingObservability('BILLING_HEALTH', healthy ? 'healthy' : 'degraded', {
    overall_score,
    renewals_total: metrics.renewals_total,
  });

  const report: BillingObservabilityReport = {
    version: BILLING_OBSERVABILITY_VERSION,
    metrics,
    dashboard: buildBillingHealthDashboard(metrics),
    health: {
      healthy,
      overall_score,
      checks,
      version: BILLING_OBSERVABILITY_VERSION,
    },
    performance: {
      recent_profiles: getRecentPerformanceProfiles(10),
      average_stage_durations_ms: getAverageStageDurations(),
    },
  };

  if (options?.includeAudit) {
    report.audit = await runBillingOperationalAudit();
  }

  return report;
}

export { runBillingOperationalAudit };
