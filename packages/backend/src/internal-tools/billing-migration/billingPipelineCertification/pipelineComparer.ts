/**
 * Billing Engine V2 — Sprint 3.0E: compara snapshots operacionais V1 vs V2.
 */
import { logPipelineCertification } from './pipelineCertificationLogger.js';
import type {
  PipelineCompareDifference,
  PipelineCompareResult,
  PipelineGateScore,
  PipelineOperationalSnapshot,
} from './types.js';

function pushDiff(
  diffs: PipelineCompareDifference[],
  dimension: PipelineCompareDifference['dimension'],
  field: string,
  legacy_value: unknown,
  v2_value: unknown,
  blocking = true
): void {
  if (JSON.stringify(legacy_value) === JSON.stringify(v2_value)) return;
  diffs.push({ dimension, field, legacy_value, v2_value, blocking });
}

function scoreGate(
  dimension: PipelineCompareDifference['dimension'],
  diffs: PipelineCompareDifference[]
): PipelineGateScore {
  const dimensionDiffs = diffs.filter((d) => d.dimension === dimension);
  const blocking = dimensionDiffs.filter((d) => d.blocking);
  const passed = blocking.length === 0;
  const score = passed ? 100 : 0;

  logPipelineCertification('PIPELINE_GATE', passed ? 'passed' : 'failed', {
    dimension,
    score,
    blocking_count: blocking.length,
  });

  return { dimension, score, passed, differences: dimensionDiffs };
}

function compareInvoice(
  legacy: PipelineOperationalSnapshot,
  v2: PipelineOperationalSnapshot,
  diffs: PipelineCompareDifference[]
): void {
  if (!legacy.invoice && !v2.invoice) return;
  if (!legacy.invoice || !v2.invoice) {
    pushDiff(diffs, 'invoice', 'presence', legacy.invoice, v2.invoice);
    return;
  }
  const fields: Array<keyof NonNullable<typeof legacy.invoice>> = [
    'period_start',
    'period_end',
    'amount_cents',
    'due_date',
    'gateway',
    'currency',
    'subtotal_cents',
    'discounts_cents',
    'taxes_cents',
    'status',
  ];
  for (const field of fields) {
    pushDiff(diffs, 'invoice', field, legacy.invoice[field], v2.invoice[field]);
  }
}

function compareItems(
  legacy: PipelineOperationalSnapshot,
  v2: PipelineOperationalSnapshot,
  diffs: PipelineCompareDifference[]
): void {
  if (legacy.invoice_items.length !== v2.invoice_items.length) {
    pushDiff(
      diffs,
      'invoice_items',
      'count',
      legacy.invoice_items.length,
      v2.invoice_items.length
    );
    return;
  }
  for (let i = 0; i < legacy.invoice_items.length; i++) {
    const l = legacy.invoice_items[i]!;
    const r = v2.invoice_items[i]!;
    const fields: Array<keyof typeof l> = [
      'sequence',
      'description',
      'quantity',
      'unit_price_cents',
      'discount_cents',
      'tax_cents',
      'total_cents',
      'is_recurring',
    ];
    for (const field of fields) {
      pushDiff(diffs, 'invoice_items', `${i}.${field}`, l[field], r[field]);
    }
  }
}

function compareGateway(
  legacy: PipelineOperationalSnapshot,
  v2: PipelineOperationalSnapshot,
  diffs: PipelineCompareDifference[]
): void {
  if (!legacy.gateway && !v2.gateway) return;
  if (!legacy.gateway || !v2.gateway) {
    pushDiff(diffs, 'gateway', 'presence', legacy.gateway, v2.gateway);
    return;
  }
  const fields: Array<keyof NonNullable<typeof legacy.gateway>> = [
    'amount_cents',
    'due_date',
    'payment_method',
    'idempotency_key_prefix',
    'status',
    'failed',
  ];
  for (const field of fields) {
    pushDiff(diffs, 'gateway', field, legacy.gateway[field], v2.gateway[field]);
  }
}

function compareScalarDimension(
  dimension: Exclude<
    PipelineCompareDifference['dimension'],
    'invoice' | 'invoice_items' | 'gateway'
  >,
  legacy: Record<string, unknown>,
  v2: Record<string, unknown>,
  fields: string[],
  diffs: PipelineCompareDifference[]
): void {
  for (const field of fields) {
    pushDiff(diffs, dimension, field, legacy[field], v2[field]);
  }
}

export function compareOperationalSnapshots(
  legacy: PipelineOperationalSnapshot,
  v2: PipelineOperationalSnapshot
): PipelineCompareResult {
  const diffs: PipelineCompareDifference[] = [];

  logPipelineCertification('PIPELINE_COMPARE', 'start', {
    scenario_id: legacy.scenario_id,
    legacy_scenario: legacy.scenario_id,
    v2_scenario: v2.scenario_id,
  });

  compareInvoice(legacy, v2, diffs);
  compareItems(legacy, v2, diffs);
  compareGateway(legacy, v2, diffs);

  compareScalarDimension('notification', legacy.notification, v2.notification, ['status', 'queued'], diffs);
  compareScalarDimension(
    'timeline',
    legacy.timeline as unknown as Record<string, unknown>,
    v2.timeline as unknown as Record<string, unknown>,
    ['status', 'events_recorded'],
    diffs
  );
  if (JSON.stringify(legacy.timeline.event_types) !== JSON.stringify(v2.timeline.event_types)) {
    pushDiff(diffs, 'timeline', 'event_types', legacy.timeline.event_types, v2.timeline.event_types);
  }

  compareScalarDimension(
    'history',
    legacy.history as unknown as Record<string, unknown>,
    v2.history as unknown as Record<string, unknown>,
    ['status', 'result_outcome'],
    diffs
  );
  compareScalarDimension(
    'subscription',
    legacy.subscription as unknown as Record<string, unknown>,
    v2.subscription as unknown as Record<string, unknown>,
    ['advanced', 'current_period_start', 'current_period_end', 'next_billing_date'],
    diffs
  );
  compareScalarDimension(
    'billing_job',
    legacy.billing_job as unknown as Record<string, unknown>,
    v2.billing_job as unknown as Record<string, unknown>,
    ['completion_outcome', 'idempotent'],
    diffs
  );
  compareScalarDimension(
    'billing_result',
    legacy.billing_result as unknown as Record<string, unknown>,
    v2.billing_result as unknown as Record<string, unknown>,
    [
      'success',
      'invoice_id_present',
      'gateway_status',
      'notification_status',
      'timeline_status',
      'history_status',
      'subscription_advanced',
      'completion_outcome',
    ],
    diffs
  );
  compareScalarDimension(
    'idempotency',
    legacy.idempotency as unknown as Record<string, unknown>,
    v2.idempotency as unknown as Record<string, unknown>,
    ['reused_existing', 'engine_skipped'],
    diffs
  );
  compareScalarDimension(
    'rollback',
    legacy.rollback as unknown as Record<string, unknown>,
    v2.rollback as unknown as Record<string, unknown>,
    ['triggered', 'invoice_deleted'],
    diffs
  );

  if (legacy.error?.code !== v2.error?.code) {
    pushDiff(diffs, 'error', 'code', legacy.error?.code ?? null, v2.error?.code ?? null);
  }
  if (legacy.error?.stage !== v2.error?.stage) {
    pushDiff(diffs, 'error', 'stage', legacy.error?.stage ?? null, v2.error?.stage ?? null);
  }

  const dimensions: PipelineCompareDifference['dimension'][] = [
    'invoice',
    'invoice_items',
    'gateway',
    'notification',
    'timeline',
    'history',
    'subscription',
    'billing_job',
    'billing_result',
    'idempotency',
    'rollback',
  ];

  const gates = dimensions.map((d) => scoreGate(d, diffs));
  const overall_score =
    gates.length === 0 ? 100 : Math.round(gates.reduce((s, g) => s + g.score, 0) / gates.length);
  const approved = gates.every((g) => g.passed);

  logPipelineCertification('PIPELINE_COMPARE', 'complete', {
    scenario_id: legacy.scenario_id,
    overall_score,
    approved,
    difference_count: diffs.length,
  });

  return {
    scenario_id: legacy.scenario_id,
    gates,
    overall_score,
    approved,
    differences: diffs,
  };
}

export function aggregateGateScores(results: PipelineCompareResult[]): {
  invoice_score: number;
  invoice_items_score: number;
  gateway_score: number;
  notification_score: number;
  timeline_score: number;
  history_score: number;
  subscription_score: number;
  billing_result_score: number;
  idempotency_score: number;
  rollback_score: number;
  overall_score: number;
} {
  const avg = (dim: PipelineCompareDifference['dimension']) => {
    const scores = results.map(
      (r) => r.gates.find((g) => g.dimension === dim)?.score ?? 100
    );
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100;
  };

  const invoice_score = avg('invoice');
  const invoice_items_score = avg('invoice_items');
  const gateway_score = avg('gateway');
  const notification_score = avg('notification');
  const timeline_score = avg('timeline');
  const history_score = avg('history');
  const subscription_score = avg('subscription');
  const billing_result_score = avg('billing_result');
  const idempotency_score = avg('idempotency');
  const rollback_score = avg('rollback');

  const overall_score = Math.round(
    (invoice_score +
      invoice_items_score +
      gateway_score +
      notification_score +
      timeline_score +
      history_score +
      subscription_score +
      billing_result_score +
      idempotency_score +
      rollback_score) /
      10
  );

  return {
    invoice_score,
    invoice_items_score,
    gateway_score,
    notification_score,
    timeline_score,
    history_score,
    subscription_score,
    billing_result_score,
    idempotency_score,
    rollback_score,
    overall_score,
  };
}
