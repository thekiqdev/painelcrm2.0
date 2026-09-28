/**
 * Sprint 4.2 — Production Readiness Certification types.
 */

export type AuditSeverity = 'error' | 'warning' | 'info';

export type AuditIssue = {
  code: string;
  severity: AuditSeverity;
  message: string;
  tenant_id?: string;
  subscription_id?: string;
  meta?: Record<string, unknown>;
};

export type AuditModuleResult = {
  module: string;
  certified: boolean;
  generated_at_iso: string;
  duration_ms: number;
  issues: AuditIssue[];
  repairs: string[];
  metrics: Record<string, number | string | boolean | null>;
  samples?: unknown[];
};

export type ProductionReadinessSummary = {
  sprint: '4.2';
  title: 'Production Readiness Certification';
  generated_at_iso: string;
  duration_ms: number;
  certified: boolean;
  status: 'PRODUCTION READY' | 'NOT READY';
  deployment_approved: boolean;
  modules: Record<
    string,
    {
      certified: boolean;
      issue_count: number;
      repair_count: number;
    }
  >;
  checklist: Array<{ item: string; passed: boolean }>;
  expected_final_status: {
    billing_platform: string;
    billing_runtime: string;
    billing_worker: string;
    billing_financial: string;
    billing_calendar: string;
    billing_migration: string;
    deployment: string;
  };
};

export type ProductionReadinessOptions = {
  tenantId?: string;
  subscriptionLimit?: number;
  repair?: boolean;
  dryRun?: boolean;
  outputDir?: string;
};

export const PRODUCTION_AUDIT_ARTIFACTS = [
  'production-subscription-audit.json',
  'worker-certification.json',
  'financial-certification.json',
  'migration-certification.json',
  'calendar-consistency.json',
  'performance-certification.json',
  'timezone-certification.json',
  'production-readiness-summary.json',
] as const;
