/**
 * Billing Engine V2 — Sprint 2.4B: Regression Suite.
 */
import { GOLDEN_SCENARIOS, STRESS_ITERATION_LEVELS } from './billingGoldenDataset.js';
import { runScenarioPipeline } from './billingScenarioRunner.js';
import { runStressSuite } from './billingStressRunner.js';
import { recordLabRun } from './billingFunctionalMetrics.js';
import type {
  BillingFunctionalCertificationReport,
  RegressionSuiteResult,
  StressSuiteResult,
} from './types.js';
import { CERTIFICATION_LAB_VERSION } from './types.js';

export async function runRegressionSuite(): Promise<RegressionSuiteResult> {
  const scenarios = GOLDEN_SCENARIOS.map((scenario) => runScenarioPipeline(scenario));
  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.length - passed;
  const avg =
    scenarios.length > 0
      ? Math.round(scenarios.reduce((sum, s) => sum + s.duration_ms, 0) / scenarios.length)
      : 0;

  return {
    version: CERTIFICATION_LAB_VERSION,
    generated_at: new Date().toISOString(),
    total_scenarios: scenarios.length,
    passed,
    failed,
    pass_rate_pct: scenarios.length > 0 ? Math.round((passed / scenarios.length) * 10000) / 100 : 0,
    avg_duration_ms: avg,
    scenarios,
    approved: failed === 0,
  };
}

function coveragePct(scenarios: RegressionSuiteResult['scenarios'], tag: string): number {
  const tagged = scenarios.filter((s) => s.scenario.tags.includes(tag));
  if (tagged.length === 0) return 100;
  const ok = tagged.filter((s) => s.passed).length;
  return Math.round((ok / tagged.length) * 10000) / 100;
}

function moduleCoveragePct(scenarios: RegressionSuiteResult['scenarios'], check: (s: (typeof scenarios)[0]) => boolean): number {
  if (scenarios.length === 0) return 0;
  const ok = scenarios.filter(check).length;
  return Math.round((ok / scenarios.length) * 10000) / 100;
}

export async function runBillingFunctionalCertification(): Promise<BillingFunctionalCertificationReport> {
  const regression = await runRegressionSuite();
  const stressResult = await runStressSuite(STRESS_ITERATION_LEVELS);
  const stress: StressSuiteResult = {
    version: CERTIFICATION_LAB_VERSION,
    generated_at: new Date().toISOString(),
    levels: stressResult.levels,
    approved: stressResult.approved,
  };

  const golden_passed = regression.passed;
  const golden_failed = regression.failed;
  const approved =
    regression.approved && stress.approved && golden_failed === 0;

  const report: BillingFunctionalCertificationReport = {
    version: CERTIFICATION_LAB_VERSION,
    generated_at: new Date().toISOString(),
    lab_mode: 'LOCAL_ONLY',
    regression,
    stress,
    golden_dataset: {
      total: regression.total_scenarios,
      passed: golden_passed,
      failed: golden_failed,
      pass_rate_pct: regression.pass_rate_pct,
    },
    summary: {
      total_scenarios: regression.total_scenarios,
      approved: golden_passed,
      rejected: golden_failed,
      avg_duration_ms: regression.avg_duration_ms,
      performance: {
        stress_100_ms: stress.levels.find((l) => l.iterations === 100)?.total_duration_ms ?? null,
        stress_500_ms: stress.levels.find((l) => l.iterations === 500)?.total_duration_ms ?? null,
        stress_1000_ms: stress.levels.find((l) => l.iterations === 1000)?.total_duration_ms ?? null,
        stress_5000_ms: stress.levels.find((l) => l.iterations === 5000)?.total_duration_ms ?? null,
      },
      coverage: {
        functional: coveragePct(regression.scenarios, 'functional'),
        financial: coveragePct(regression.scenarios, 'financial'),
        operational: moduleCoveragePct(regression.scenarios, (s) => s.passed),
        gateway: coveragePct(regression.scenarios, 'gateway'),
        notifications: coveragePct(regression.scenarios, 'notifications'),
        scheduler: coveragePct(regression.scenarios, 'scheduler'),
        worker: coveragePct(regression.scenarios, 'worker'),
        migration: coveragePct(regression.scenarios, 'migration'),
        projection: moduleCoveragePct(regression.scenarios, (s) =>
          s.assertions.find((a) => a.name === 'projection_approved')?.passed === true
        ),
        consistency: moduleCoveragePct(regression.scenarios, (s) =>
          s.assertions.find((a) => a.name === 'consistency_approved')?.passed === true
        ),
        shadow: moduleCoveragePct(regression.scenarios, (s) =>
          s.assertions.find((a) => a.name === 'shadow_approved')?.passed === true
        ),
        certification: moduleCoveragePct(regression.scenarios, (s) => s.certification.certified),
      },
    },
    recommendation: approved ? 'CERTIFIED' : 'NOT_CERTIFIED',
  };

  recordLabRun({
    approved,
    totalScenarios: regression.total_scenarios,
    passed: golden_passed,
    failed: golden_failed,
  });

  return report;
}
