/**
 * Billing Engine V2 — Sprint 2.4A: Certification Suite types.
 */
import type { BillingCutoverDecision } from '../billingCutover/types.js';
import type { BillingMigrationReadinessReport } from '../billingMigrationReadiness/types.js';
import type { BillingMigrationSimulationReport, MigrationSimulationRecommendation } from '../billingMigrationSimulator/types.js';

export const CERTIFICATION_SUITE_VERSION = 'v2_certification_suite_sprint_2_4a';

export type CertificationRecommendation = 'CERTIFIED' | 'NOT_CERTIFIED';

export type CertificationFailure = {
  code: string;
  stage: 'context' | 'projection' | 'consistency' | 'shadow' | 'simulator' | 'readiness' | 'cutover';
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  detail?: Record<string, unknown>;
};

export type CertificationStageSummaries = {
  context: {
    passed: boolean;
    errors: string[];
    warnings: string[];
    build_time_ms: number;
  };
  projection: {
    score: number;
    approved: boolean;
    passed: boolean;
    hash: string | null;
  };
  consistency: {
    score: number;
    confidence: number;
    approved: boolean;
    passed: boolean;
  };
  shadow: {
    score: number;
    approved: boolean;
    passed: boolean;
    error_differences: number;
    critical_differences: number;
  };
  simulator: {
    recommendation: MigrationSimulationRecommendation;
    passed: boolean;
    score: number;
  };
  readiness: {
    overall_score: number;
    ready_for_migration: boolean;
    recommendation: string;
    passed: boolean;
  };
  cutover: {
    approved: boolean;
    approval_level: string;
    feature_flag_recommendation: string;
    passed: boolean;
  };
};

export type BillingCertificationReport = {
  tenant_id: string;
  subscription_id: string;
  correlation_id: string;
  certification_score: number;
  certified: boolean;
  certified_at: string | null;
  recommendation: CertificationRecommendation;
  projection_summary: CertificationStageSummaries['projection'];
  consistency_summary: CertificationStageSummaries['consistency'];
  shadow_summary: CertificationStageSummaries['shadow'];
  readiness_summary: CertificationStageSummaries['readiness'];
  simulator_summary: CertificationStageSummaries['simulator'];
  cutover_summary: CertificationStageSummaries['cutover'];
  context_summary: CertificationStageSummaries['context'];
  failures: CertificationFailure[];
  warnings: CertificationFailure[];
  generated_at: string;
  execution_time_ms: number;
  diagnostics: {
    engine_version: string;
    tenant_gates_evaluated: boolean;
  };
};

export type CertificationDashboard = {
  total_subscriptions: number;
  certified: number;
  failed: number;
  average_score: number | null;
  projection_100_pct: number;
  shadow_100_pct: number;
  consistency_100_pct: number;
  simulator_ok_pct: number;
  cutover_ok_pct: number;
  engine_certified: boolean;
  recommendation: CertificationRecommendation;
  last_evaluation: string | null;
  recent: Array<{
    subscription_id: string;
    tenant_id: string;
    certified: boolean;
    certification_score: number;
    recommendation: string;
    generated_at: string;
  }>;
};

export type CertificationHealthStats = {
  healthy: boolean;
  total_subscriptions: number;
  certified: number;
  failed: number;
  average_score: number | null;
  engine_certified: boolean;
  last_evaluation: string | null;
};

export type TenantCertificationGates = {
  readiness: BillingMigrationReadinessReport;
  simulator: BillingMigrationSimulationReport;
  cutover: { decision: BillingCutoverDecision };
};
