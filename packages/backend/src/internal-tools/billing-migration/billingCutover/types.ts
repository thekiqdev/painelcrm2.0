/**
 * Billing Engine V2 — Sprint 2.3G: Billing Cutover Orchestrator types.
 */
import type { BillingMigrationReadinessReport } from '../billingMigrationReadiness/types.js';
import type { BillingMigrationSimulationReport } from '../billingMigrationSimulator/types.js';

export const CUTOVER_ORCHESTRATOR_VERSION = 'v2_cutover_orchestrator_sprint_2_3g';

export type CutoverApprovalLevel =
  | 'NOT_READY'
  | 'READY_WITH_WARNINGS'
  | 'READY'
  | 'APPROVED'
  | 'CUTOVER_PENDING'
  | 'BLOCKED';

export type CutoverTimelineStage =
  | 'NOT_READY'
  | 'READY_WITH_WARNINGS'
  | 'READY'
  | 'APPROVED'
  | 'CUTOVER_PENDING';

export type FeatureFlagRecommendation =
  | 'KEEP_V1'
  | 'ENABLE_SHADOW'
  | 'ENABLE_DUAL_WRITE'
  | 'ENABLE_V2'
  | 'ROLLBACK_TO_V1';

export type CutoverRecommendedAction =
  | 'WAIT'
  | 'REVIEW'
  | 'PREPARE_CUTOVER'
  | 'EXECUTE_CUTOVER_SPRINT_2_4'
  | 'FIX_BLOCKERS'
  | 'ROLLBACK';

export type CutoverIssueSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type CutoverBlockingIssue = {
  code: string;
  severity: CutoverIssueSeverity;
  source: 'readiness' | 'simulator' | 'shadow' | 'consistency' | 'projection' | 'policy' | 'health';
  message: string;
  detail?: Record<string, unknown>;
};

export type BillingRollbackStrategy = {
  rollback_safe: boolean;
  rollback_required: boolean;
  rollback_reason: string | null;
  rollback_steps: string[];
  estimated_duration: string;
};

export type BillingCutoverDecision = {
  approved: boolean;
  approvalLevel: CutoverApprovalLevel;
  reason: string;
  blockingIssues: CutoverBlockingIssue[];
  warnings: CutoverBlockingIssue[];
  recommendedAction: CutoverRecommendedAction;
  rollbackPlan: BillingRollbackStrategy;
  nextEvaluation: string | null;
  featureFlagRecommendation: FeatureFlagRecommendation;
  timeline: CutoverTimelineStage;
  overallScore: number;
};

export type CutoverPolicyInput = {
  readiness: BillingMigrationReadinessReport;
  simulator: BillingMigrationSimulationReport;
  shadowScore: number | null;
  projectionScore: number | null;
  consistencyApproved?: boolean;
};

export type CutoverPolicyResult = {
  approved: boolean;
  approvalLevel: CutoverApprovalLevel;
  blockingIssues: CutoverBlockingIssue[];
  warnings: CutoverBlockingIssue[];
  overallScore: number;
};

export type BillingCutoverReport = {
  tenant_id: string;
  tenant_name: string | null;
  correlation_id: string;
  decision: BillingCutoverDecision;
  readiness_snapshot: Record<string, unknown>;
  simulator_snapshot: Record<string, unknown>;
  projection_snapshot: Record<string, unknown>;
  consistency_snapshot: Record<string, unknown>;
  shadow_snapshot: Record<string, unknown>;
  generated_at: string;
  diagnostics: {
    duration_ms: number;
    engine_version: string;
  };
};

export type CutoverDashboard = {
  ready: number;
  blocked: number;
  warnings: number;
  average_score: number | null;
  pending: number;
  candidates: number;
  rollback_safe: number;
  shadow_healthy: number;
  last_evaluation: string | null;
  recent: Array<{
    tenant_id: string;
    approval_level: string;
    recommendation: string;
    approved: boolean;
    overall_score: number;
    generated_at: string;
  }>;
};

export type CutoverHealthStats = {
  healthy: boolean;
  ready_tenants: number;
  blocked_tenants: number;
  average_approval: number | null;
  last_evaluation: string | null;
  rollback_safe: number;
  cutover_candidates: number;
};
