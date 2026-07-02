import { describe, it, expect, beforeEach } from 'vitest';
import { clearProjectionCacheForTests } from '../../../billingProjection/projectionCache.js';
import { resetProjectionMetricsForTests } from '../../../billingProjection/projectionMetrics.js';
import { GOLDEN_SCENARIOS } from './billingGoldenDataset.js';
import { buildScenarioContext, listRegisteredScenarioIds } from './billingScenarioFactory.js';
import { runScenarioPipeline } from './billingScenarioRunner.js';
import { runRegressionSuite } from './billingRegressionSuite.js';
import { runStressLevel } from './billingStressRunner.js';
import { resetLabMetricsForTests } from './billingFunctionalMetrics.js';

describe('Billing Certification Lab — Golden Dataset', () => {
  beforeEach(() => {
    clearProjectionCacheForTests();
    resetProjectionMetricsForTests();
    resetLabMetricsForTests();
  });

  it('registra todos os cenários obrigatórios', () => {
    const registered = listRegisteredScenarioIds();
    for (const scenario of GOLDEN_SCENARIOS) {
      expect(registered).toContain(scenario.id);
    }
    expect(GOLDEN_SCENARIOS.length).toBeGreaterThanOrEqual(40);
  });

  it('factory produz contexto para cada cenário', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      const ctx = buildScenarioContext(scenario.id);
      expect(ctx.subscription.id).toBeTruthy();
      expect(ctx.diagnostics.engineReady).toBe(true);
    }
  });
});

describe('Billing Certification Lab — Scenario Runner', () => {
  beforeEach(() => {
    clearProjectionCacheForTests();
    resetProjectionMetricsForTests();
    resetLabMetricsForTests();
  });

  for (const scenario of GOLDEN_SCENARIOS) {
    it(`cenário ${scenario.id} passa pipeline completo`, () => {
      const result = runScenarioPipeline(scenario);
      if (!result.passed) {
        const failed = result.assertions.filter((a) => !a.passed).map((a) => `${a.name}:${a.message}`);
        throw new Error(`${scenario.id} falhou: ${failed.join(', ')}`);
      }
      expect(result.certification.certified).toBe(true);
      expect(result.certification.score).toBe(100);
    });
  }
});

describe('Billing Certification Lab — Regression Suite', () => {
  beforeEach(() => {
    clearProjectionCacheForTests();
    resetProjectionMetricsForTests();
    resetLabMetricsForTests();
  });

  it('regression suite 100% aprovada', async () => {
    const result = await runRegressionSuite();
    expect(result.approved).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.pass_rate_pct).toBe(100);
  });
});

describe('Billing Certification Lab — Stress', () => {
  beforeEach(() => {
    clearProjectionCacheForTests();
    resetProjectionMetricsForTests();
  });

  it('stress 100 iterações', async () => {
    const result = await runStressLevel(100);
    expect(result.passed).toBe(true);
    expect(result.idempotency_ok).toBe(true);
    expect(result.concurrency_ok).toBe(true);
  });
});
