/**
 * Billing Engine V2 — Sprint 2.3E: Migration Readiness Engine (READ ONLY).
 */
import { pool } from '../../../utils/db.js';
import { evaluateConsistency } from './evaluateConsistency.js';
import { evaluateGateway } from './evaluateGateway.js';
import { evaluateItems } from './evaluateItems.js';
import { evaluateJobs } from './evaluateJobs.js';
import { evaluateNotifications } from './evaluateNotifications.js';
import { evaluatePlans } from './evaluatePlans.js';
import { evaluateProjection } from './evaluateProjection.js';
import { evaluateShadow } from './evaluateShadow.js';
import {
  logMigrationApproval,
  logMigrationBlocker,
  logMigrationReadiness,
  logMigrationScore,
} from './migrationReadinessLogger.js';
import { recordMigrationEvaluation } from './migrationReadinessMetrics.js';
import {
  isReadyForMigration,
  resolveApprovalLevel,
  resolveMigrationRecommendation,
} from './migrationReadinessRecommendation.js';
import { computeWeightedOverallScore } from './migrationReadinessScore.js';
import type {
  BillingMigrationReadinessReport,
  MigrationBlockingIssue,
  MigrationReadinessStatistics,
} from './types.js';
import { MIGRATION_READINESS_ENGINE_VERSION } from './types.js';

export class BillingMigrationReadinessEngine {
  static async evaluateTenant(tenantId: string): Promise<BillingMigrationReadinessReport> {
    const started = Date.now();
    logMigrationReadiness('start', { tenant_id: tenantId });

    const tenantRow = await pool.query<{ company_name: string | null }>(
      `SELECT company_name FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [tenantId]
    );
    const tenantName = tenantRow.rows[0]?.company_name ?? null;

    const [
      shadow,
      projection,
      consistency,
      plans,
      items,
      jobs,
      gateway,
      notifications,
      subsCount,
    ] = await Promise.all([
      evaluateShadow(tenantId),
      evaluateProjection(tenantId),
      evaluateConsistency(tenantId),
      evaluatePlans(tenantId),
      evaluateItems(tenantId),
      evaluateJobs(tenantId),
      evaluateGateway(tenantId),
      evaluateNotifications(tenantId),
      pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM subscriptions
         WHERE tenant_id = $1::uuid AND type = 'customer'`,
        [tenantId]
      ),
    ]);

    const areas = [
      shadow.area,
      projection.area,
      consistency.area,
      plans.area,
      items.area,
      jobs.area,
      gateway.area,
      notifications.area,
    ];

    const allIssues: MigrationBlockingIssue[] = [
      ...shadow.issues,
      ...projection.issues,
      ...consistency.issues,
      ...plans.issues,
      ...items.issues,
      ...jobs.issues,
      ...gateway.issues,
      ...notifications.issues,
    ];

    const criticalIssues = allIssues.filter((i) => i.severity === 'CRITICAL');
    const errors = allIssues.filter((i) => i.severity === 'ERROR');
    const warnings = allIssues.filter((i) => i.severity === 'WARNING');
    const blockingIssues = [...criticalIssues, ...errors];

    const overallScore = computeWeightedOverallScore(areas);
    const readyForMigration = isReadyForMigration({ areas, blockingIssues });
    const migrationRecommendation = resolveMigrationRecommendation({
      readyForMigration,
      areas,
      blockingIssues,
    });
    const approvalLevel = resolveApprovalLevel({
      overallScore,
      readyForMigration,
      warnings,
      criticalIssues,
      errors,
    });

    const statistics: MigrationReadinessStatistics = {
      subscriptions_total: parseInt(subsCount.rows[0]?.total ?? '0', 10),
      subscriptions_evaluated: parseInt(subsCount.rows[0]?.total ?? '0', 10),
      shadow_reports: Number(shadow.summary.total ?? 0),
      consistency_reports: Number(consistency.summary.total ?? 0),
      plans_total: Number(plans.summary.total ?? 0),
      items_total: Number(items.summary.total ?? 0),
      jobs_pending: Number(jobs.summary.pending ?? 0),
      jobs_failed: Number(jobs.summary.failed ?? 0),
      jobs_stuck: Number(jobs.summary.stuck ?? 0),
    };

    const evaluationMs = Date.now() - started;
    const generatedAt = new Date().toISOString();

    const report: BillingMigrationReadinessReport = {
      tenantId,
      tenantName,
      overallScore,
      approved: readyForMigration,
      approvalLevel,
      readyForMigration,
      migrationRecommendation,
      blockingIssues,
      warnings,
      criticalIssues,
      areaScores: areas,
      statistics,
      shadowSummary: shadow.summary,
      projectionSummary: projection.summary,
      consistencySummary: consistency.summary,
      engineHealthSummary: {
        jobs: jobs.summary,
        gateway: gateway.summary,
        notifications: notifications.summary,
      },
      diagnostics: {
        evaluation_ms: evaluationMs,
        engine_version: MIGRATION_READINESS_ENGINE_VERSION,
        areas_evaluated: areas.map((a) => a.area),
        data_sources: [
          'billing_shadow_reports',
          'billing_consistency_reports',
          'billing_plans',
          'billing_plan_items',
          'billing_recurring_jobs',
          'subscriptions',
          'notification_outbound_deliveries',
        ],
      },
      generatedAt,
    };

    logMigrationScore({ tenant_id: tenantId, overall_score: overallScore, duration_ms: evaluationMs });
    logMigrationApproval({
      tenant_id: tenantId,
      overall_score: overallScore,
      approval: approvalLevel,
      recommendation: migrationRecommendation,
    });
    for (const issue of criticalIssues) {
      logMigrationBlocker({
        tenant_id: tenantId,
        code: issue.code,
        critical_count: criticalIssues.length,
      });
    }
    logMigrationReadiness('complete', {
      tenant_id: tenantId,
      overall_score: overallScore,
      approval: approvalLevel,
      recommendation: migrationRecommendation,
      critical_count: criticalIssues.length,
      duration_ms: evaluationMs,
    });

    recordMigrationEvaluation({
      approved: readyForMigration,
      overallScore,
      criticalCount: criticalIssues.length,
      readyForMigration,
    });

    return report;
  }
}
