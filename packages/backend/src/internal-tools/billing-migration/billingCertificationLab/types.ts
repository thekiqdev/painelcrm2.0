/**
 * Billing Engine V2 — Sprint 2.4B: Functional Certification Lab types.
 */
import type { BillingConsistencyResult } from '../../../billingConsistency/types.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { BillingCutoverDecision } from '../billingCutover/types.js';
import type { ProjectionResult } from '../../../billingProjection/types.js';
import type { MigrationSimulationRecommendation } from '../billingMigrationSimulator/types.js';
import type { RenewalComparisonResult } from '../billingShadow/types.js';
import type { CertificationRecommendation } from '../billingCertification/types.js';

export const CERTIFICATION_LAB_VERSION = 'v2_functional_cert_lab_sprint_2_4b';

export type ScenarioGroup = 'A' | 'B' | 'C' | 'D';

export type GoldenScenarioDef = {
  id: string;
  group: ScenarioGroup;
  name: string;
  description: string;
  tags: string[];
};

export type AssertionResult = {
  name: string;
  passed: boolean;
  message?: string;
  detail?: Record<string, unknown>;
};

export type ScenarioPipelineResult = {
  scenario: GoldenScenarioDef;
  context: BillingExecutionContext;
  projection: ProjectionResult;
  consistency: BillingConsistencyResult;
  shadow: RenewalComparisonResult;
  simulatorRecommendation: MigrationSimulationRecommendation;
  cutover: BillingCutoverDecision;
  certification: {
    certified: boolean;
    score: number;
    recommendation: CertificationRecommendation;
  };
  assertions: AssertionResult[];
  passed: boolean;
  duration_ms: number;
  errors: string[];
};

export type StressLevelResult = {
  iterations: number;
  passed: boolean;
  total_duration_ms: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  memory_heap_mb_start: number;
  memory_heap_mb_end: number;
  memory_heap_delta_mb: number;
  parallel_batches: number;
  idempotency_ok: boolean;
  concurrency_ok: boolean;
  errors: string[];
};

export type RegressionSuiteResult = {
  version: string;
  generated_at: string;
  total_scenarios: number;
  passed: number;
  failed: number;
  pass_rate_pct: number;
  avg_duration_ms: number;
  scenarios: ScenarioPipelineResult[];
  approved: boolean;
};

export type StressSuiteResult = {
  version: string;
  generated_at: string;
  levels: StressLevelResult[];
  approved: boolean;
};

export type BillingFunctionalCertificationReport = {
  version: string;
  generated_at: string;
  lab_mode: 'LOCAL_ONLY';
  regression: RegressionSuiteResult;
  stress: StressSuiteResult;
  golden_dataset: {
    total: number;
    passed: number;
    failed: number;
    pass_rate_pct: number;
  };
  summary: {
    total_scenarios: number;
    approved: number;
    rejected: number;
    avg_duration_ms: number;
    performance: {
      stress_100_ms: number | null;
      stress_500_ms: number | null;
      stress_1000_ms: number | null;
      stress_5000_ms: number | null;
    };
    coverage: {
      functional: number;
      financial: number;
      operational: number;
      gateway: number;
      notifications: number;
      scheduler: number;
      worker: number;
      migration: number;
      projection: number;
      consistency: number;
      shadow: number;
      certification: number;
    };
  };
  recommendation: 'CERTIFIED' | 'NOT_CERTIFIED';
};
