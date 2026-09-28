/**
 * Billing Engine V2 — Sprint 2.3E: Migration Readiness types.
 */

export type MigrationApprovalLevel =
  | 'NOT_READY'
  | 'PARTIALLY_READY'
  | 'READY'
  | 'READY_WITH_WARNINGS';

export type MigrationRecommendation =
  | 'READY_TO_MIGRATE'
  | 'WAIT_NEXT_CYCLE'
  | 'FIX_PROJECTION'
  | 'FIX_CONSISTENCY'
  | 'FIX_GATEWAY'
  | 'FIX_NOTIFICATIONS'
  | 'FIX_JOBS'
  | 'FIX_PLANS'
  | 'FIX_ITEMS';

export type MigrationIssueSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type MigrationBlockingIssue = {
  code: string;
  severity: MigrationIssueSeverity;
  area: string;
  message: string;
  subscription_id?: string | null;
  detail?: Record<string, unknown>;
};

export type MigrationAreaScore = {
  area: string;
  weight: number;
  score: number;
  passed: boolean;
  detail?: Record<string, unknown>;
};

export type MigrationReadinessStatistics = {
  subscriptions_total: number;
  subscriptions_evaluated: number;
  shadow_reports: number;
  consistency_reports: number;
  plans_total: number;
  items_total: number;
  jobs_pending: number;
  jobs_failed: number;
  jobs_stuck: number;
};

export type MigrationReadinessDiagnostics = {
  evaluation_ms: number;
  engine_version: string;
  areas_evaluated: string[];
  data_sources: string[];
};

export type BillingMigrationReadinessReport = {
  tenantId: string;
  tenantName?: string | null;
  overallScore: number;
  approved: boolean;
  approvalLevel: MigrationApprovalLevel;
  readyForMigration: boolean;
  migrationRecommendation: MigrationRecommendation;
  blockingIssues: MigrationBlockingIssue[];
  warnings: MigrationBlockingIssue[];
  criticalIssues: MigrationBlockingIssue[];
  areaScores: MigrationAreaScore[];
  statistics: MigrationReadinessStatistics;
  shadowSummary: Record<string, unknown>;
  projectionSummary: Record<string, unknown>;
  consistencySummary: Record<string, unknown>;
  engineHealthSummary: Record<string, unknown>;
  diagnostics: MigrationReadinessDiagnostics;
  generatedAt: string;
};

export type MigrationReadinessDashboard = {
  total_tenants: number;
  ready: number;
  not_ready: number;
  average_score: number | null;
  critical_issues: number;
  top_problems: Array<{ code: string; count: number }>;
  migration_candidates: Array<{ tenant_id: string; tenant_name: string | null; score: number }>;
  last_evaluation: string | null;
};

export type MigrationReadinessHealthStats = {
  ready_tenants: number;
  not_ready_tenants: number;
  average_score: number | null;
  critical_tenants: number;
  last_evaluation: string | null;
  migration_candidates: number;
};

export const MIGRATION_READINESS_ENGINE_VERSION = 'v2_migration_readiness_sprint_2_3e';

export const MIGRATION_AREA_WEIGHTS = {
  shadow: 25,
  projection: 20,
  consistency: 20,
  billing_plans: 10,
  billing_items: 10,
  jobs: 5,
  gateway: 5,
  notifications: 5,
} as const;
