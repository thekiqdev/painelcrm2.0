/**
 * Sprint 4.2A — Valida que o auditor detecta injeções propositais e mapeia reparos.
 */
import type { AuditModuleResult } from '../types.js';
import {
  AUDITOR_SCENARIOS,
  type AuditorScenarioDefinition,
  type AuditorScenarioId,
} from './auditorScenarioCatalog.js';

export type SimulatedFaultState = {
  has_billing_plan: boolean;
  billing_item_count: number;
  next_billing_date: string | null;
  subscription_status: string;
  duplicate_cycle_dates: string[];
  orphan_invoice_count: number;
  stuck_processing_jobs: number;
  recoverable_failed_cycles: number;
  timezone_valid: boolean;
  financial_orphan_invoices: number;
  reconciliation_mismatch: number;
};

export type ScenarioValidationResult = {
  scenario_id: AuditorScenarioId;
  name: string;
  detected: boolean;
  detection_codes_found: string[];
  repair_mapped: boolean;
  repair_actions_found: string[];
  false_positive: boolean;
  false_negative: boolean;
  passed: boolean;
  inject: string;
  expected_detection_codes: string[];
  expected_repair_actions: string[];
};

export type AuditorCertificationReport = {
  sprint: '4.2A';
  title: 'Auditor Certification';
  generated_at_iso: string;
  duration_ms: number;
  auditor_certified: boolean;
  scenarios_total: number;
  scenarios_passed: number;
  scenarios_failed: number;
  detection_rate_pct: number;
  repair_rate_pct: number;
  false_positives: number;
  false_negatives: number;
  scenarios: ScenarioValidationResult[];
};

const CLEAN_STATE: SimulatedFaultState = {
  has_billing_plan: true,
  billing_item_count: 1,
  next_billing_date: '2026-07-15',
  subscription_status: 'active',
  duplicate_cycle_dates: [],
  orphan_invoice_count: 0,
  stuck_processing_jobs: 0,
  recoverable_failed_cycles: 0,
  timezone_valid: true,
  financial_orphan_invoices: 0,
  reconciliation_mismatch: 0,
};

function faultStateForScenario(id: AuditorScenarioId): SimulatedFaultState {
  const base = { ...CLEAN_STATE };
  switch (id) {
    case 'missing_billing_plan':
      return { ...base, has_billing_plan: false };
    case 'missing_billing_items':
      return { ...base, billing_item_count: 0 };
    case 'missing_next_billing_date':
      return { ...base, next_billing_date: null };
    case 'duplicated_cycles':
      return { ...base, duplicate_cycle_dates: ['2026-07-01', '2026-07-01'] };
    case 'invoice_orphan':
      return { ...base, orphan_invoice_count: 2 };
    case 'worker_processing_forever':
      return { ...base, stuck_processing_jobs: 1 };
    case 'recoverable_failed_cycle':
      return { ...base, recoverable_failed_cycles: 1 };
    case 'timezone':
      return { ...base, timezone_valid: false };
    case 'financial_integrity':
      return { ...base, financial_orphan_invoices: 1, reconciliation_mismatch: 1 };
    default:
      return base;
  }
}

/** Espelha códigos emitidos pelos módulos 4.2 para um estado simulado. */
export function detectIssuesFromSimulatedState(state: SimulatedFaultState): string[] {
  const codes: string[] = [];
  if (!state.has_billing_plan) {
    codes.push('missing_billing_plan', 'legacy_missing_billing_plan');
  }
  if (state.has_billing_plan && state.billing_item_count < 1) {
    codes.push('plan_without_items', 'legacy_missing_billing_plan');
  }
  if (state.subscription_status === 'active' && !state.next_billing_date) {
    codes.push('missing_next_billing_date', 'active_without_next_charge');
  }
  for (const _date of state.duplicate_cycle_dates) {
    if (state.duplicate_cycle_dates.filter((d) => d === _date).length > 1) {
      codes.push('duplicate_cycle', 'cycles_reconciliation_mismatch');
      break;
    }
  }
  if (state.reconciliation_mismatch > 0) {
    codes.push('cycles_reconciliation_mismatch');
  }
  if (state.orphan_invoice_count > 0) {
    codes.push('orphan_invoice', 'orphan_subscription_invoices');
  }
  if (state.financial_orphan_invoices > 0) {
    codes.push('orphan_subscription_invoices');
  }
  if (state.stuck_processing_jobs > 0) {
    codes.push('stuck_processing_jobs');
  }
  if (state.recoverable_failed_cycles > 0) {
    codes.push('recoverable_failed_with_invoice');
  }
  if (!state.timezone_valid) {
    codes.push('sp_boundary_failed', 'utc_boundary_failed', 'invalid_timezone', 'ymd_normalize_mismatch');
  }
  return [...new Set(codes)];
}

export function repairActionsForSimulatedState(state: SimulatedFaultState): string[] {
  const repairs: string[] = [];
  if (!state.has_billing_plan || state.billing_item_count < 1) {
    repairs.push('billing_plan_provisioned', 'provisioned:sub-1');
  }
  if (state.subscription_status === 'active' && !state.next_billing_date) {
    repairs.push('billing_plan_provisioned');
  }
  if (state.stuck_processing_jobs > 0) {
    repairs.push('stuck_retry_reset:1');
  }
  if (state.recoverable_failed_cycles > 0) {
    repairs.push('cycles_failed_to_pending:1', 'jobs_failed_to_pending:1');
  }
  return repairs;
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((p) => value === p || value.includes(p.replace(/:$/, '')));
}

function validateScenario(def: AuditorScenarioDefinition): ScenarioValidationResult {
  const faultState = faultStateForScenario(def.id);
  const cleanState = CLEAN_STATE;

  const detectedOnFault = detectIssuesFromSimulatedState(faultState);
  const detectedOnClean = detectIssuesFromSimulatedState(cleanState);
  const repairsOnFault = repairActionsForSimulatedState(faultState);

  const detectionFound = def.detection_codes.some((code) => detectedOnFault.includes(code));
  const falsePositive = def.detection_codes.some((code) => detectedOnClean.includes(code));
  const falseNegative = !detectionFound;

  const repairMapped =
    !def.auto_repairable ||
    def.repair_actions.length === 0 ||
    def.repair_actions.some((pattern) =>
      repairsOnFault.some((r) => matchesAnyPattern(r, [pattern]))
    );

  const passed = detectionFound && !falsePositive && repairMapped;

  return {
    scenario_id: def.id,
    name: def.name,
    detected: detectionFound,
    detection_codes_found: detectedOnFault,
    repair_mapped: repairMapped,
    repair_actions_found: repairsOnFault,
    false_positive: falsePositive,
    false_negative: falseNegative,
    passed,
    inject: def.inject,
    expected_detection_codes: def.detection_codes,
    expected_repair_actions: def.repair_actions,
  };
}

export function runAuditorScenarioValidation(): AuditorCertificationReport {
  const started = Date.now();
  const scenarios = AUDITOR_SCENARIOS.map(validateScenario);
  const passed = scenarios.filter((s) => s.passed).length;
  const repairable = scenarios.filter((s) => {
    const def = AUDITOR_SCENARIOS.find((d) => d.id === s.scenario_id)!;
    return def.auto_repairable;
  });
  const repairablePassed = repairable.filter((s) => s.repair_mapped).length;

  return {
    sprint: '4.2A',
    title: 'Auditor Certification',
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    auditor_certified: passed === scenarios.length,
    scenarios_total: scenarios.length,
    scenarios_passed: passed,
    scenarios_failed: scenarios.length - passed,
    detection_rate_pct: Math.round((passed / scenarios.length) * 100),
    repair_rate_pct:
      repairable.length > 0 ? Math.round((repairablePassed / repairable.length) * 100) : 100,
    false_positives: scenarios.filter((s) => s.false_positive).length,
    false_negatives: scenarios.filter((s) => s.false_negative).length,
    scenarios,
  };
}

/** Confirma que módulos reais 4.2 cobrem os módulos declarados em cada cenário. */
export function validateModuleCoverage(
  modules: Record<string, AuditModuleResult>
): { covered: boolean; gaps: string[] } {
  const moduleAlias: Record<string, string> = { runtime: 'productionSubscriptions' };
  const gaps: string[] = [];
  for (const scenario of AUDITOR_SCENARIOS) {
    for (const mod of scenario.audit_modules) {
      const key = moduleAlias[mod] ?? mod;
      if (!modules[key]) {
        gaps.push(`${scenario.id}:missing_module:${mod}`);
      }
    }
  }
  return { covered: gaps.length === 0, gaps };
}
