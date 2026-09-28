/**
 * Billing Engine V2 — Sprint 2.4B: tenant gates perfeitos para o laboratório.
 */
import { buildCutoverDecision } from '../billingCutover/billingCutoverDecision.js';
import type { BillingCutoverDecision } from '../billingCutover/types.js';
import type { BillingMigrationReadinessReport } from '../billingMigrationReadiness/types.js';
import type { BillingMigrationSimulationReport } from '../billingMigrationSimulator/types.js';

export function perfectReadinessForLab(): BillingMigrationReadinessReport {
  return {
    tenantId: 't1',
    overallScore: 100,
    approved: true,
    approvalLevel: 'READY',
    readyForMigration: true,
    migrationRecommendation: 'READY_TO_MIGRATE',
    blockingIssues: [],
    warnings: [],
    criticalIssues: [],
    areaScores: [
      { area: 'shadow', weight: 25, score: 100, passed: true },
      { area: 'projection', weight: 20, score: 100, passed: true },
      { area: 'consistency', weight: 20, score: 100, passed: true },
      { area: 'billing_plans', weight: 10, score: 100, passed: true },
      { area: 'billing_items', weight: 10, score: 100, passed: true },
      { area: 'jobs', weight: 5, score: 100, passed: true },
      { area: 'gateway', weight: 5, score: 100, passed: true },
      { area: 'notifications', weight: 5, score: 100, passed: true },
    ],
    statistics: {
      subscriptions_total: 1,
      subscriptions_evaluated: 1,
      shadow_reports: 1,
      consistency_reports: 1,
      plans_total: 1,
      items_total: 1,
      jobs_pending: 0,
      jobs_failed: 0,
      jobs_stuck: 0,
    },
    shadowSummary: { avg_score: 100 },
    projectionSummary: { avg_score: 100 },
    consistencySummary: { avg_score: 100 },
    engineHealthSummary: {},
    diagnostics: {
      evaluation_ms: 1,
      engine_version: 'lab',
      areas_evaluated: [],
      data_sources: [],
    },
    generatedAt: new Date().toISOString(),
  };
}

export function perfectSimulatorForLab(): BillingMigrationSimulationReport {
  return {
    tenant_id: 't1',
    tenant_name: 'Lab',
    correlation_id: 'lab-corr',
    subscriptions: [],
    impact: {
      identical: true,
      score: 100,
      risk: 'NONE',
      differences: [],
      financialImpact: {
        legacy_total_cents: 9900,
        projected_total_cents: 9900,
        difference_cents: 0,
        difference_percent: 0,
        subtotal_delta: 0,
        discounts_delta: 0,
        taxes_delta: 0,
      },
      itemChanges: [],
      notificationImpact: {
        would_dispatch: true,
        templates: ['crm_invoice_charge'],
        recipients: ['lab@test.com'],
        variables: {},
      },
      gatewayImpact: {
        identical: true,
        provider: 'asaas',
        currency: 'BRL',
        fees_delta: 0,
        payment_method_match: true,
        payload_diff_fields: [],
      },
      timelineImpact: {
        identical: true,
        expected_events: ['renewal_completed'],
        legacy_events: ['renewal_completed'],
        order_match: true,
      },
      historyImpact: {
        identical: true,
        expected_changes: ['subscription_cycle_advanced'],
        legacy_changes: ['subscription_cycle_advanced'],
      },
      jobsImpact: {
        expected_job: true,
        scheduler_would_enqueue: true,
        worker_would_process: true,
        retry_expected: false,
        notes: [],
      },
    },
    comparison: null,
    projection: null,
    consistency: null,
    shadow: null,
    overall_score: 100,
    recommended: 'READY_TO_MIGRATE',
    rollback_safe: true,
    rollback_preview: {
      rollback_possible: true,
      rollback_steps: ['Desativar feature flag V2'],
      notes: [],
    },
    generated_at: new Date().toISOString(),
    diagnostics: {
      duration_ms: 1,
      engine_version: 'lab',
      subscriptions_simulated: 1,
    },
  };
}

export function perfectCutoverForLab(): BillingCutoverDecision {
  return buildCutoverDecision({
    tenantId: 't1',
    correlationId: 'lab-corr',
    readiness: perfectReadinessForLab(),
    simulator: perfectSimulatorForLab(),
    shadowScore: 100,
    projectionScore: 100,
    consistencyApproved: true,
  });
}
