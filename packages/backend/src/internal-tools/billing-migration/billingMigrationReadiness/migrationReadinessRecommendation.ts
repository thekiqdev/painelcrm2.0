/**
 * Billing Engine V2 — Sprint 2.3E: recomendação automática de migração.
 */
import type {
  MigrationApprovalLevel,
  MigrationAreaScore,
  MigrationBlockingIssue,
  MigrationRecommendation,
} from './types.js';
import { isAreaPerfect } from './migrationReadinessScore.js';

function areaScore(areas: MigrationAreaScore[], key: string): number {
  return areas.find((a) => a.area === key)?.score ?? 0;
}

export function resolveMigrationRecommendation(params: {
  readyForMigration: boolean;
  areas: MigrationAreaScore[];
  blockingIssues: MigrationBlockingIssue[];
}): MigrationRecommendation {
  if (params.readyForMigration) return 'READY_TO_MIGRATE';

  const hasCritical = params.blockingIssues.some((i) => i.severity === 'CRITICAL');
  const hasError = params.blockingIssues.some((i) => i.severity === 'ERROR');

  if (areaScore(params.areas, 'projection') < 100) return 'FIX_PROJECTION';
  if (areaScore(params.areas, 'consistency') < 100) return 'FIX_CONSISTENCY';
  if (areaScore(params.areas, 'billing_plans') < 100) return 'FIX_PLANS';
  if (areaScore(params.areas, 'billing_items') < 100) return 'FIX_ITEMS';
  if (areaScore(params.areas, 'gateway') < 100) return 'FIX_GATEWAY';
  if (areaScore(params.areas, 'notifications') < 100) return 'FIX_NOTIFICATIONS';
  if (areaScore(params.areas, 'jobs') < 100) return 'FIX_JOBS';
  if (areaScore(params.areas, 'shadow') < 100) return 'WAIT_NEXT_CYCLE';
  if (hasCritical || hasError) return 'WAIT_NEXT_CYCLE';
  return 'WAIT_NEXT_CYCLE';
}

export function resolveApprovalLevel(params: {
  overallScore: number;
  readyForMigration: boolean;
  warnings: MigrationBlockingIssue[];
  criticalIssues: MigrationBlockingIssue[];
  errors: MigrationBlockingIssue[];
}): MigrationApprovalLevel {
  if (params.readyForMigration && params.warnings.length === 0) return 'READY';
  if (params.readyForMigration && params.warnings.length > 0) return 'READY_WITH_WARNINGS';
  if (params.criticalIssues.length > 0 || params.errors.length > 0) return 'NOT_READY';
  if (params.overallScore >= 50) return 'PARTIALLY_READY';
  return 'NOT_READY';
}

export function isReadyForMigration(params: {
  areas: MigrationAreaScore[];
  blockingIssues: MigrationBlockingIssue[];
}): boolean {
  const shadowOk = isAreaPerfect(areaScore(params.areas, 'shadow'));
  const projectionOk = isAreaPerfect(areaScore(params.areas, 'projection'));
  const consistencyOk = isAreaPerfect(areaScore(params.areas, 'consistency'));
  const plansOk = isAreaPerfect(areaScore(params.areas, 'billing_plans'));
  const itemsOk = isAreaPerfect(areaScore(params.areas, 'billing_items'));
  const jobsOk = isAreaPerfect(areaScore(params.areas, 'jobs'));
  const gatewayOk = isAreaPerfect(areaScore(params.areas, 'gateway'));
  const notificationsOk = isAreaPerfect(areaScore(params.areas, 'notifications'));

  const hasCritical = params.blockingIssues.some((i) => i.severity === 'CRITICAL');
  const hasError = params.blockingIssues.some((i) => i.severity === 'ERROR');

  return (
    shadowOk &&
    projectionOk &&
    consistencyOk &&
    plansOk &&
    itemsOk &&
    jobsOk &&
    gatewayOk &&
    notificationsOk &&
    !hasCritical &&
    !hasError
  );
}
