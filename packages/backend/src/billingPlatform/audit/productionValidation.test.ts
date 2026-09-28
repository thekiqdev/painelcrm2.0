import { describe, it, expect } from 'vitest';
import { AUDITOR_SCENARIOS } from './validation/auditorScenarioCatalog.js';
import {
  detectIssuesFromSimulatedState,
  repairActionsForSimulatedState,
  runAuditorScenarioValidation,
} from './validation/auditorScenarioValidator.js';
import { computeBillingHealthScore } from './validation/billingHealthScore.js';
import { PRODUCTION_VALIDATION_ARTIFACTS } from './validation/productionValidationOrchestrator.js';
import type { AuditModuleResult } from './types.js';

function certifiedModule(name: string): AuditModuleResult {
  return {
    module: name,
    certified: true,
    generated_at_iso: new Date().toISOString(),
    duration_ms: 1,
    issues: [],
    repairs: [],
    metrics: { missing_plan_count: 0, missing_items_count: 0 },
  };
}

describe('Billing Platform audit — Sprint 4.2A', () => {
  it('PRODUCTION_VALIDATION_ARTIFACTS lista artefatos 4.2A', () => {
    expect(PRODUCTION_VALIDATION_ARTIFACTS).toContain('production-certification.json');
    expect(PRODUCTION_VALIDATION_ARTIFACTS).toContain('production-ready-snapshot.json');
    expect(PRODUCTION_VALIDATION_ARTIFACTS.length).toBeGreaterThanOrEqual(7);
  });

  it('todos os 9 cenários do auditor passam validação sintética', () => {
    const report = runAuditorScenarioValidation();
    expect(report.scenarios_total).toBe(9);
    expect(report.scenarios_passed).toBe(9);
    expect(report.auditor_certified).toBe(true);
    expect(report.false_positives).toBe(0);
    expect(report.false_negatives).toBe(0);
    expect(report.detection_rate_pct).toBe(100);
    expect(report.repair_rate_pct).toBe(100);
  });

  it.each(AUDITOR_SCENARIOS.map((s) => [s.id, s.detection_codes]))(
    'cenário %s detecta códigos esperados',
    (id, codes) => {
      const scenario = AUDITOR_SCENARIOS.find((s) => s.id === id)!;
      const faultCodes = detectIssuesFromSimulatedState(
        scenario.id === 'missing_billing_plan'
          ? { has_billing_plan: false, billing_item_count: 0, next_billing_date: null, subscription_status: 'active', duplicate_cycle_dates: [], orphan_invoice_count: 0, stuck_processing_jobs: 0, recoverable_failed_cycles: 0, timezone_valid: true, financial_orphan_invoices: 0, reconciliation_mismatch: 0 }
          : {
              has_billing_plan: scenario.id !== 'missing_billing_plan',
              billing_item_count: scenario.id === 'missing_billing_items' ? 0 : 1,
              next_billing_date: scenario.id === 'missing_next_billing_date' ? null : '2026-07-15',
              subscription_status: 'active',
              duplicate_cycle_dates: scenario.id === 'duplicated_cycles' ? ['2026-07-01', '2026-07-01'] : [],
              orphan_invoice_count: scenario.id === 'invoice_orphan' ? 1 : 0,
              stuck_processing_jobs: scenario.id === 'worker_processing_forever' ? 1 : 0,
              recoverable_failed_cycles: scenario.id === 'recoverable_failed_cycle' ? 1 : 0,
              timezone_valid: scenario.id !== 'timezone',
              financial_orphan_invoices: scenario.id === 'financial_integrity' ? 1 : 0,
              reconciliation_mismatch: scenario.id === 'financial_integrity' ? 1 : 0,
            }
      );
      for (const code of codes as string[]) {
        expect(faultCodes.some((c) => c === code || faultCodes.includes(code))).toBe(true);
      }
    }
  );

  it('estado limpo não gera falso positivo nos cenários reparáveis', () => {
    const clean = {
      has_billing_plan: true,
      billing_item_count: 1,
      next_billing_date: '2026-07-15',
      subscription_status: 'active',
      duplicate_cycle_dates: [] as string[],
      orphan_invoice_count: 0,
      stuck_processing_jobs: 0,
      recoverable_failed_cycles: 0,
      timezone_valid: true,
      financial_orphan_invoices: 0,
      reconciliation_mismatch: 0,
    };
    const codes = detectIssuesFromSimulatedState(clean);
    expect(codes).toHaveLength(0);
    expect(repairActionsForSimulatedState(clean)).toHaveLength(0);
  });

  it('health score >= 99 com módulos certificados e auditor OK', () => {
    const modules = {
      productionSubscriptions: certifiedModule('productionSubscriptions'),
      worker: certifiedModule('worker'),
      financial: certifiedModule('financial'),
      migration: certifiedModule('migration'),
      calendar: certifiedModule('calendar'),
      timezone: certifiedModule('timezone'),
      performance: certifiedModule('performance'),
    };
    const auditor = runAuditorScenarioValidation();
    const health = computeBillingHealthScore(modules, auditor);
    expect(health.billing_health_score).toBeGreaterThanOrEqual(99);
    expect(health.deployment_ready).toBe(true);
  });
});
