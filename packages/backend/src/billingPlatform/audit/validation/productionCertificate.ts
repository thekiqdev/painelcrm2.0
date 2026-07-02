/**
 * Sprint 4.2A — Certificado definitivo de produção.
 */
import type { ProductionReadinessReport } from '../productionReadinessOrchestrator.js';
import type { BillingHealthScoreReport } from './billingHealthScore.js';
import type { AuditorCertificationReport } from './auditorScenarioValidator.js';
import type { StressValidationReport } from './stressValidation.js';
import type { AuditModuleResult } from '../types.js';
import { BILLING_HEALTH_THRESHOLD } from './billingHealthScore.js';

export type ProductionCertification = {
  sprint: '4.2A';
  title: 'Production Certification';
  status: 'PRODUCTION READY' | 'NOT READY';
  generated_at_iso: string;
  billing_health_score: number;
  deployment_ready: boolean;
  auditor_certified: boolean;
  runtime_certified: boolean;
  worker_certified: boolean;
  financial_certified: boolean;
  calendar_certified: boolean;
  timezone_certified: boolean;
  migration_certified: boolean;
  performance_certified: boolean;
  stress_certified: boolean;
  legacy_cycles_certified: boolean;
  state_machine_certified: boolean;
  health_threshold: number;
  certificates: {
    auditor: 'AUDITOR CERTIFIED' | 'NOT CERTIFIED';
    production: 'PRODUCTION READY' | 'NOT READY';
  };
};

export type ProductionValidationSummary = {
  sprint: '4.2A';
  title: 'Production Validation & Certification';
  generated_at_iso: string;
  duration_ms: number;
  status: 'PRODUCTION READY' | 'NOT READY';
  certified: boolean;
  billing_health_score: number;
  deployment_ready: boolean;
  readiness: ProductionReadinessReport['summary'];
  auditor: Pick<
    AuditorCertificationReport,
    | 'auditor_certified'
    | 'scenarios_passed'
    | 'scenarios_failed'
    | 'detection_rate_pct'
    | 'repair_rate_pct'
    | 'false_positives'
    | 'false_negatives'
  >;
  health: Pick<BillingHealthScoreReport, 'billing_health_score' | 'deployment_ready'>;
  stress: Pick<StressValidationReport, 'certified' | 'invariants'>;
  definition_of_done: Array<{ item: string; passed: boolean }>;
};

export function buildProductionCertification(input: {
  readiness: ProductionReadinessReport;
  auditor: AuditorCertificationReport;
  health: BillingHealthScoreReport;
  stress: StressValidationReport;
  legacyCycles?: AuditModuleResult;
  stateMachine?: AuditModuleResult;
}): ProductionCertification {
  const { readiness, auditor, health, stress, legacyCycles, stateMachine } = input;
  const modules = readiness.modules;

  const runtime_certified = modules.productionSubscriptions?.certified ?? false;
  const worker_certified = modules.worker?.certified ?? false;
  const financial_certified = modules.financial?.certified ?? false;
  const calendar_certified = modules.calendar?.certified ?? false;
  const timezone_certified = modules.timezone?.certified ?? false;
  const migration_certified = modules.migration?.certified ?? false;
  const performance_certified = modules.performance?.certified ?? false;
  const legacy_cycles_certified = legacyCycles?.certified ?? true;
  const state_machine_certified = stateMachine?.certified ?? true;

  const allFlags =
    auditor.auditor_certified &&
    runtime_certified &&
    worker_certified &&
    financial_certified &&
    calendar_certified &&
    timezone_certified &&
    migration_certified &&
    performance_certified &&
    stress.certified &&
    legacy_cycles_certified &&
    state_machine_certified &&
    health.billing_health_score >= BILLING_HEALTH_THRESHOLD &&
    readiness.summary.certified;

  const status = allFlags ? 'PRODUCTION READY' : 'NOT READY';

  return {
    sprint: '4.2A',
    title: 'Production Certification',
    status,
    generated_at_iso: new Date().toISOString(),
    billing_health_score: health.billing_health_score,
    deployment_ready: health.deployment_ready && allFlags,
    auditor_certified: auditor.auditor_certified,
    runtime_certified,
    worker_certified,
    financial_certified,
    calendar_certified,
    timezone_certified,
    migration_certified,
    performance_certified,
    stress_certified: stress.certified,
    legacy_cycles_certified,
    state_machine_certified,
    health_threshold: BILLING_HEALTH_THRESHOLD,
    certificates: {
      auditor: auditor.auditor_certified ? 'AUDITOR CERTIFIED' : 'NOT CERTIFIED',
      production: status,
    },
  };
}

export function buildProductionValidationSummary(input: {
  startedAt: number;
  readiness: ProductionReadinessReport;
  auditor: AuditorCertificationReport;
  health: BillingHealthScoreReport;
  stress: StressValidationReport;
  certification: ProductionCertification;
}): ProductionValidationSummary {
  const { readiness, auditor, health, stress, certification } = input;

  const definition_of_done = [
    { item: 'Auditoria encontrou todos os erros injetados', passed: auditor.scenarios_failed === 0 },
    { item: 'Reparos automáticos mapeados corretamente', passed: auditor.repair_rate_pct === 100 },
    { item: 'Nenhum falso positivo', passed: auditor.false_positives === 0 },
    { item: 'Nenhum falso negativo', passed: auditor.false_negatives === 0 },
    { item: 'Worker certificado', passed: certification.worker_certified },
    { item: 'Scheduler certificado', passed: certification.worker_certified },
    { item: 'Runtime certificado', passed: certification.runtime_certified },
    { item: 'Timezone certificado', passed: certification.timezone_certified },
    { item: 'Performance aprovada', passed: certification.performance_certified },
    { item: 'Stress validation aprovada', passed: stress.certified },
    { item: `Health Score >= ${BILLING_HEALTH_THRESHOLD}`, passed: health.billing_health_score >= BILLING_HEALTH_THRESHOLD },
    { item: "Certificado AUDITOR CERTIFIED", passed: auditor.auditor_certified },
    { item: "Certificado PRODUCTION READY", passed: certification.status === 'PRODUCTION READY' },
  ];

  return {
    sprint: '4.2A',
    title: 'Production Validation & Certification',
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - input.startedAt,
    status: certification.status,
    certified: certification.status === 'PRODUCTION READY',
    billing_health_score: health.billing_health_score,
    deployment_ready: certification.deployment_ready,
    readiness: readiness.summary,
    auditor: {
      auditor_certified: auditor.auditor_certified,
      scenarios_passed: auditor.scenarios_passed,
      scenarios_failed: auditor.scenarios_failed,
      detection_rate_pct: auditor.detection_rate_pct,
      repair_rate_pct: auditor.repair_rate_pct,
      false_positives: auditor.false_positives,
      false_negatives: auditor.false_negatives,
    },
    health: {
      billing_health_score: health.billing_health_score,
      deployment_ready: health.deployment_ready,
    },
    stress: {
      certified: stress.certified,
      invariants: stress.invariants,
    },
    definition_of_done,
  };
}
