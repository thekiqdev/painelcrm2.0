import { describe, it, expect } from 'vitest';
import type { NormalizedRenewalResult } from '../billingShadow/types.js';
import { analyzeMigrationImpact } from './impactAnalyzer.js';
import { resolveSimulationRecommendation } from './recommendationEngine.js';
import { buildRollbackPreview, isRollbackSafe } from './rollbackPreview.js';
import { serializeSimulationDashboard } from './billingMigrationSimulatorService.js';
import type { BillingMigrationSimulationReport, MigrationImpact } from './types.js';

function baseNormalized(overrides: Partial<NormalizedRenewalResult> = {}): NormalizedRenewalResult {
  return {
    subscription: { id: 's1', customer: 'c1', tenant: 't1', status: 'active' },
    cycle: '2026-06-01',
    billingPlanVersion: 1,
    itemCount: 1,
    items: [
      {
        sequence: 1,
        quantity: 1,
        unit_price: 10000,
        discount: 0,
        tax: 0,
        currency: 'BRL',
        total: 10000,
        definition_hash: 'h1',
        name: 'Plano',
      },
    ],
    subtotal: 10000,
    discounts: 0,
    taxes: 0,
    total: 10000,
    currency: 'BRL',
    dueDate: '2026-06-01',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    gatewayPayload: null,
    notificationPayload: null,
    timelineEvents: [],
    historyEvents: [],
    sideEffects: { invoice: true, notification: false, timeline: false, history: false, gateway: false },
    metadata: {},
    ...overrides,
  };
}

function baseImpact(overrides: Partial<MigrationImpact> = {}): MigrationImpact {
  return {
    identical: true,
    score: 100,
    risk: 'NONE',
    differences: [],
    financialImpact: {
      legacy_total_cents: 10000,
      projected_total_cents: 10000,
      difference_cents: 0,
      difference_percent: 0,
      subtotal_delta: 0,
      discounts_delta: 0,
      taxes_delta: 0,
    },
    itemChanges: [],
    notificationImpact: { would_dispatch: false, templates: [], recipients: [], variables: {} },
    gatewayImpact: {
      identical: true,
      provider: null,
      currency: 'BRL',
      fees_delta: 0,
      payment_method_match: true,
      payload_diff_fields: [],
    },
    timelineImpact: {
      identical: true,
      expected_events: [],
      legacy_events: [],
      order_match: true,
    },
    historyImpact: { identical: true, expected_changes: [], legacy_changes: [] },
    jobsImpact: {
      expected_job: true,
      scheduler_would_enqueue: true,
      worker_would_process: true,
      retry_expected: false,
      notes: [],
    },
    ...overrides,
  };
}

describe('impactAnalyzer', () => {
  it('identifica impacto idêntico', () => {
    const legacy = baseNormalized();
    const projected = baseNormalized();
    const comparison = {
      legacy,
      shadow: projected,
      differences: [],
      score: 100,
      approved: true,
      severity: 'INFO' as const,
      comparison_time_ms: 1,
    };
    const impact = analyzeMigrationImpact({
      legacy,
      projectedNormalized: projected,
      projectedInvoice: {
        invoice: {
          subscription_id: 's1',
          tenant_id: 't1',
          customer_id: 'c1',
          cycle_key: '2026-06-01',
          billing_plan_id: 'p1',
          billing_plan_version: 1,
          currency: 'BRL',
        },
        invoiceItems: [],
        subtotal: 10000,
        discounts: 0,
        taxes: 0,
        fees: 0,
        grandTotal: 10000,
        currency: 'BRL',
        period: {
          cycleKey: '2026-06-01',
          periodStart: '2026-06-01',
          periodEnd: '2026-06-30',
          dueDate: '2026-06-01',
          nextGeneration: null,
          anchor: null,
          interval: 'monthly',
          frequency: 1,
        },
        dueDate: '2026-06-01',
        gateway: null,
        notifications: null,
        timeline: [],
        history: [],
        metadata: {},
        diagnostics: {
          calculationTime: 1,
          warnings: [],
          errors: [],
          hash: 'abc',
          calculatorVersions: {},
          cacheHit: false,
          builderVersion: '1',
        },
      },
      comparison,
    });
    expect(impact.identical).toBe(true);
    expect(impact.score).toBe(100);
    expect(impact.risk).toBe('NONE');
    expect(impact.itemChanges[0]?.type).toBe('unchanged');
  });

  it('detecta item modificado e impacto financeiro', () => {
    const legacy = baseNormalized();
    const projected = baseNormalized({ total: 12000, items: [{ ...legacy.items[0], total: 12000, unit_price: 12000 }] });
    const comparison = {
      legacy,
      shadow: projected,
      differences: [{ field: 'total', legacy_value: 10000, shadow_value: 12000, severity: 'ERROR' as const, reason: 'mismatch' }],
      score: 75,
      approved: false,
      severity: 'ERROR' as const,
      comparison_time_ms: 1,
    };
    const impact = analyzeMigrationImpact({
      legacy,
      projectedNormalized: projected,
      projectedInvoice: {} as never,
      comparison,
    });
    expect(impact.financialImpact.difference_cents).toBe(2000);
    expect(impact.itemChanges[0]?.type).toBe('modified');
    expect(impact.risk).not.toBe('NONE');
  });
});

describe('recommendationEngine', () => {
  it('READY_TO_MIGRATE quando idêntico', () => {
    expect(
      resolveSimulationRecommendation({
        overallScore: 100,
        impact: baseImpact(),
        consistencyApproved: true,
        hasSubscriptions: true,
      })
    ).toBe('READY_TO_MIGRATE');
  });

  it('DO_NOT_MIGRATE sem assinaturas', () => {
    expect(
      resolveSimulationRecommendation({
        overallScore: 0,
        impact: baseImpact({ risk: 'CRITICAL' }),
        consistencyApproved: false,
        hasSubscriptions: false,
      })
    ).toBe('DO_NOT_MIGRATE');
  });

  it('BLOCKED quando consistency reprovada', () => {
    expect(
      resolveSimulationRecommendation({
        overallScore: 90,
        impact: baseImpact({ risk: 'LOW' }),
        consistencyApproved: false,
        hasSubscriptions: true,
      })
    ).toBe('BLOCKED');
  });
});

describe('rollbackPreview', () => {
  it('rollback possível para READY_TO_MIGRATE', () => {
    const preview = buildRollbackPreview({
      recommendation: 'READY_TO_MIGRATE',
      rollback_safe: isRollbackSafe('READY_TO_MIGRATE'),
    });
    expect(preview.rollback_possible).toBe(true);
    expect(preview.rollback_steps.length).toBeGreaterThan(0);
  });

  it('rollback não necessário para DO_NOT_MIGRATE', () => {
    const preview = buildRollbackPreview({
      recommendation: 'DO_NOT_MIGRATE',
      rollback_safe: true,
    });
    expect(preview.rollback_steps[0]).toContain('não necessário');
  });
});

describe('serializeSimulationDashboard', () => {
  it('serializa campos do dashboard', () => {
    const report: BillingMigrationSimulationReport = {
      tenant_id: 't1',
      tenant_name: 'Acme',
      correlation_id: 'corr',
      subscriptions: [],
      impact: baseImpact(),
      comparison: null,
      projection: null,
      consistency: null,
      shadow: null,
      overall_score: 100,
      recommended: 'READY_TO_MIGRATE',
      rollback_safe: true,
      rollback_preview: { rollback_possible: true, rollback_steps: [], notes: [] },
      generated_at: new Date().toISOString(),
      diagnostics: { duration_ms: 10, engine_version: 'v1', subscriptions_simulated: 0 },
    };
    const dash = serializeSimulationDashboard(report);
    expect(dash.tenant_id).toBe('t1');
    expect(dash.recommended).toBe('READY_TO_MIGRATE');
    expect(dash.rollback_safe).toBe(true);
  });
});
