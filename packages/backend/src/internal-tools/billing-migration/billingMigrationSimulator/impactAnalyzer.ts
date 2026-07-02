/**
 * Billing Engine V2 — Sprint 2.3F: compara Legacy × Projected (sem regras próprias).
 */
import type { NormalizedRenewalResult, RenewalComparisonResult } from '../billingShadow/types.js';
import type { ProjectedInvoice } from '../../../billingProjection/types.js';
import { logMigrationAnalyzer } from './simulatorLogger.js';
import type {
  MigrationFinancialImpact,
  MigrationGatewayImpact,
  MigrationHistoryImpact,
  MigrationImpact,
  MigrationImpactDifference,
  MigrationItemChange,
  MigrationJobsImpact,
  MigrationNotificationImpact,
  MigrationRiskLevel,
  MigrationTimelineImpact,
} from './types.js';

function categorizeField(field: string): MigrationImpactDifference['category'] {
  if (field.startsWith('items[')) return 'items';
  if (field.includes('dueDate') || field.includes('period')) return 'dates';
  if (field.startsWith('gateway')) return 'gateway';
  if (field.startsWith('notification')) return 'notifications';
  if (field.startsWith('timeline')) return 'timeline';
  if (field.startsWith('history')) return 'history';
  if (['subtotal', 'discounts', 'taxes', 'total'].includes(field)) return 'values';
  return 'invoice';
}

function resolveRisk(score: number, differences: MigrationImpactDifference[]): MigrationRiskLevel {
  if (differences.some((d) => d.severity === 'CRITICAL')) return 'CRITICAL';
  if (score >= 100 && differences.length === 0) return 'NONE';
  if (score >= 95) return 'LOW';
  if (score >= 80) return 'MEDIUM';
  if (score >= 50) return 'HIGH';
  return 'CRITICAL';
}

function analyzeItemChanges(
  legacy: NormalizedRenewalResult,
  projected: NormalizedRenewalResult
): MigrationItemChange[] {
  const legacyBySeq = new Map(legacy.items.map((it) => [it.sequence, it]));
  const projectedBySeq = new Map(projected.items.map((it) => [it.sequence, it]));
  const allSeq = new Set([...legacyBySeq.keys(), ...projectedBySeq.keys()]);
  const changes: MigrationItemChange[] = [];

  for (const seq of [...allSeq].sort((a, b) => a - b)) {
    const l = legacyBySeq.get(seq);
    const p = projectedBySeq.get(seq);
    if (!l && p) {
      changes.push({
        type: 'added',
        sequence: seq,
        definition_hash: p.definition_hash,
        description: p.name,
        projected_revision: null,
      });
    } else if (l && !p) {
      changes.push({
        type: 'removed',
        sequence: seq,
        definition_hash: l.definition_hash,
        description: l.name,
        legacy_revision: null,
      });
    } else if (l && p) {
      const fieldChanges: string[] = [];
      if (l.quantity !== p.quantity) fieldChanges.push('quantity');
      if (l.unit_price !== p.unit_price) fieldChanges.push('unit_price');
      if (l.total !== p.total) fieldChanges.push('total');
      if (l.definition_hash !== p.definition_hash) fieldChanges.push('definition_hash');
      changes.push({
        type: fieldChanges.length > 0 ? 'modified' : 'unchanged',
        sequence: seq,
        definition_hash: p.definition_hash,
        description: p.name,
        changes: fieldChanges.length > 0 ? fieldChanges : undefined,
      });
    }
  }
  return changes;
}

function buildFinancialImpact(legacy: NormalizedRenewalResult, projected: NormalizedRenewalResult): MigrationFinancialImpact {
  const legacyTotal = legacy.total;
  const projectedTotal = projected.total;
  const diff = projectedTotal - legacyTotal;
  const diffPercent = legacyTotal > 0 ? Math.round((diff / legacyTotal) * 10000) / 100 : null;
  return {
    legacy_total_cents: legacyTotal,
    projected_total_cents: projectedTotal,
    difference_cents: diff,
    difference_percent: diffPercent,
    subtotal_delta: projected.subtotal - legacy.subtotal,
    discounts_delta: projected.discounts - legacy.discounts,
    taxes_delta: projected.taxes - legacy.taxes,
  };
}

export function analyzeMigrationImpact(params: {
  legacy: NormalizedRenewalResult;
  projectedNormalized: NormalizedRenewalResult;
  projectedInvoice: ProjectedInvoice;
  comparison: RenewalComparisonResult;
  logContext?: { tenant_id: string; subscription_id?: string; cycle_key?: string; correlation_id?: string };
}): MigrationImpact {
  const started = Date.now();
  const { legacy, projectedNormalized, projectedInvoice, comparison } = params;

  const differences: MigrationImpactDifference[] = comparison.differences.map((d) => ({
    field: d.field,
    legacy_value: d.legacy_value,
    projected_value: d.shadow_value,
    severity: d.severity,
    reason: d.reason,
    category: categorizeField(d.field),
  }));

  const itemChanges = analyzeItemChanges(legacy, projectedNormalized);
  const financialImpact = buildFinancialImpact(legacy, projectedNormalized);
  const risk = resolveRisk(comparison.score, differences);

  const notificationImpact: MigrationNotificationImpact = {
    would_dispatch: Boolean(projectedNormalized.notificationPayload),
    templates: projectedInvoice.notifications?.template
      ? [projectedInvoice.notifications.template]
      : [],
    recipients: projectedInvoice.notifications?.recipient
      ? [projectedInvoice.notifications.recipient]
      : [],
    variables: (projectedInvoice.notifications?.payload as Record<string, unknown>) ?? {},
  };

  const lg = legacy.gatewayPayload;
  const pg = projectedNormalized.gatewayPayload;
  const gatewayImpact: MigrationGatewayImpact = {
    identical: JSON.stringify(lg) === JSON.stringify(pg),
    provider: (pg?.payload?.provider as string) ?? null,
    currency: pg?.currency ?? lg?.currency ?? null,
    fees_delta: (projectedInvoice.fees ?? 0) - 0,
    payment_method_match: lg?.payment_method === pg?.payment_method,
    payload_diff_fields: differences.filter((d) => d.category === 'gateway').map((d) => d.field),
  };

  const legacyTimeline = legacy.timelineEvents.map((e) => e.event).join(',');
  const projectedTimeline = projectedNormalized.timelineEvents.map((e) => e.event).join(',');
  const timelineImpact: MigrationTimelineImpact = {
    identical: legacyTimeline === projectedTimeline,
    expected_events: projectedNormalized.timelineEvents.map((e) => e.event),
    legacy_events: legacy.timelineEvents.map((e) => e.event),
    order_match: legacyTimeline === projectedTimeline,
  };

  const legacyHistory = legacy.historyEvents.map((e) => e.change).join(',');
  const projectedHistory = projectedNormalized.historyEvents.map((e) => e.change).join(',');
  const historyImpact: MigrationHistoryImpact = {
    identical: legacyHistory === projectedHistory,
    expected_changes: projectedNormalized.historyEvents.map((e) => e.change),
    legacy_changes: legacy.historyEvents.map((e) => e.change),
  };

  const jobsImpact: MigrationJobsImpact = {
    expected_job: projectedNormalized.total > 0,
    scheduler_would_enqueue: projectedNormalized.total > 0,
    worker_would_process: projectedNormalized.total > 0,
    retry_expected: false,
    notes: ['Simulação READ ONLY — nenhum job será criado'],
  };

  if (params.logContext) {
    logMigrationAnalyzer('complete', {
      ...params.logContext,
      duration_ms: Date.now() - started,
      score: comparison.score,
      risk,
    });
  }

  return {
    identical: comparison.differences.length === 0 && comparison.score === 100,
    score: comparison.score,
    risk,
    differences,
    financialImpact,
    itemChanges,
    notificationImpact,
    gatewayImpact,
    timelineImpact,
    historyImpact,
    jobsImpact,
  };
}
