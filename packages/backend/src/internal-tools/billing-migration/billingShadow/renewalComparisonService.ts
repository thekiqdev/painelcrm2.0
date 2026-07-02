/**
 * Billing Engine V2 — compara estruturas normalizadas Legacy vs Shadow.
 */
import {
  classifyFieldSeverity,
  computeComparisonScore,
  isComparisonApproved,
  resolveOverallSeverity,
} from './comparisonScore.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import { replayBillingExecutionFromContext } from '../../../billingExecutionContext/billingExecutionReplay.js';
import type { ProjectionResult } from '../../../billingProjection/types.js';
import { normalizeProjectionResult } from '../../../billingProjection/projectionNormalizer.js';
import { logProjectionCompare } from '../../../billingProjection/projectionLogger.js';
import type {
  NormalizedRenewalResult,
  RenewalComparisonDifference,
  RenewalComparisonResult,
} from './types.js';

function pushDiff(
  diffs: RenewalComparisonDifference[],
  field: string,
  legacyValue: unknown,
  shadowValue: unknown,
  reason: string
): void {
  if (Object.is(legacyValue, shadowValue)) return;
  if (
    legacyValue != null &&
    shadowValue != null &&
    typeof legacyValue === 'number' &&
    typeof shadowValue === 'number' &&
    legacyValue === shadowValue
  ) {
    return;
  }
  if (
    legacyValue != null &&
    shadowValue != null &&
    String(legacyValue) === String(shadowValue)
  ) {
    return;
  }
  const severity = classifyFieldSeverity(field, legacyValue, shadowValue);
  diffs.push({ field, legacy_value: legacyValue, shadow_value: shadowValue, severity, reason });
}

function compareObjects(
  diffs: RenewalComparisonDifference[],
  prefix: string,
  legacy: Record<string, unknown>,
  shadow: Record<string, unknown>
): void {
  const keys = new Set([...Object.keys(legacy), ...Object.keys(shadow)]);
  for (const key of keys) {
    pushDiff(diffs, `${prefix}.${key}`, legacy[key], shadow[key], `${prefix} mismatch`);
  }
}

export class RenewalComparisonService {
  compareWithExecutionContext(
    legacy: NormalizedRenewalResult,
    context: BillingExecutionContext
  ): RenewalComparisonResult {
    const replay = replayBillingExecutionFromContext(context);
    return this.compare(legacy, replay.normalized);
  }

  compareWithProjection(
    legacy: NormalizedRenewalResult,
    projection: ProjectionResult
  ): RenewalComparisonResult {
    const projected = normalizeProjectionResult(projection);
    const result = this.compare(legacy, projected);
    logProjectionCompare('compared', {
      subscription_id: legacy.subscription.id,
      cycle_key: legacy.cycle,
      duration_ms: result.comparison_time_ms,
    }, {
      score: result.score,
      approved: result.approved,
      diff_count: result.differences.length,
      projection_hash: projection.diagnostics.hash,
    });
    return result;
  }

  compare(legacy: NormalizedRenewalResult, shadow: NormalizedRenewalResult): RenewalComparisonResult {
    const started = Date.now();
    const differences: RenewalComparisonDifference[] = [];

    compareObjects(
      differences,
      'subscription',
      legacy.subscription as unknown as Record<string, unknown>,
      shadow.subscription as unknown as Record<string, unknown>
    );

    pushDiff(differences, 'cycle', legacy.cycle, shadow.cycle, 'cycle_key mismatch');
    pushDiff(
      differences,
      'billingPlanVersion',
      legacy.billingPlanVersion,
      shadow.billingPlanVersion,
      'billing plan version mismatch'
    );
    pushDiff(differences, 'itemCount', legacy.itemCount, shadow.itemCount, 'item count mismatch');
    pushDiff(differences, 'subtotal', legacy.subtotal, shadow.subtotal, 'subtotal mismatch');
    pushDiff(differences, 'discounts', legacy.discounts, shadow.discounts, 'discounts mismatch');
    pushDiff(differences, 'taxes', legacy.taxes, shadow.taxes, 'taxes mismatch');
    pushDiff(differences, 'total', legacy.total, shadow.total, 'total mismatch');
    pushDiff(differences, 'currency', legacy.currency, shadow.currency, 'currency mismatch');
    pushDiff(differences, 'dueDate', legacy.dueDate, shadow.dueDate, 'due_date mismatch');
    pushDiff(
      differences,
      'periodStart',
      legacy.periodStart,
      shadow.periodStart,
      'period_start mismatch'
    );
    pushDiff(differences, 'periodEnd', legacy.periodEnd, shadow.periodEnd, 'period_end mismatch');

    const maxItems = Math.max(legacy.items.length, shadow.items.length);
    for (let i = 0; i < maxItems; i++) {
      const l = legacy.items[i];
      const s = shadow.items[i];
      if (!l || !s) {
        pushDiff(differences, `items[${i}]`, l ?? null, s ?? null, 'missing item');
        continue;
      }
      pushDiff(differences, `items[${i}].sequence`, l.sequence, s.sequence, 'item sequence');
      pushDiff(differences, `items[${i}].quantity`, l.quantity, s.quantity, 'item quantity');
      pushDiff(differences, `items[${i}].unit_price`, l.unit_price, s.unit_price, 'item unit_price');
      pushDiff(differences, `items[${i}].discount`, l.discount, s.discount, 'item discount');
      pushDiff(differences, `items[${i}].tax`, l.tax, s.tax, 'item tax');
      pushDiff(differences, `items[${i}].currency`, l.currency, s.currency, 'item currency');
      pushDiff(differences, `items[${i}].total`, l.total, s.total, 'item total');
      pushDiff(
        differences,
        `items[${i}].definition_hash`,
        l.definition_hash,
        s.definition_hash,
        'item definition_hash'
      );
    }

    if (legacy.gatewayPayload || shadow.gatewayPayload) {
      const lg = legacy.gatewayPayload;
      const sg = shadow.gatewayPayload;
      pushDiff(differences, 'gateway.amount', lg?.amount, sg?.amount, 'gateway amount');
      pushDiff(differences, 'gateway.currency', lg?.currency, sg?.currency, 'gateway currency');
      pushDiff(
        differences,
        'gateway.payment_method',
        lg?.payment_method,
        sg?.payment_method,
        'gateway payment_method'
      );
    }

    if (legacy.notificationPayload || shadow.notificationPayload) {
      const ln = legacy.notificationPayload;
      const sn = shadow.notificationPayload;
      pushDiff(differences, 'notification.type', ln?.type, sn?.type, 'notification type');
      pushDiff(
        differences,
        'notification.recipient',
        ln?.recipient,
        sn?.recipient,
        'notification recipient'
      );
      pushDiff(
        differences,
        'notification.template',
        ln?.template,
        sn?.template,
        'notification template'
      );
    }

    const legacyTimeline = legacy.timelineEvents.map((e) => e.event).join(',');
    const shadowTimeline = shadow.timelineEvents.map((e) => e.event).join(',');
    pushDiff(differences, 'timeline.events', legacyTimeline, shadowTimeline, 'timeline events');

    const legacyHistory = legacy.historyEvents.map((e) => e.change).join(',');
    const shadowHistory = shadow.historyEvents.map((e) => e.change).join(',');
    pushDiff(differences, 'history.changes', legacyHistory, shadowHistory, 'history changes');

    compareObjects(
      differences,
      'sideEffects',
      legacy.sideEffects as unknown as Record<string, unknown>,
      shadow.sideEffects as unknown as Record<string, unknown>
    );

    const score = computeComparisonScore(differences);
    const approved = isComparisonApproved(score, differences);

    return {
      legacy,
      shadow,
      differences,
      score,
      approved,
      severity: resolveOverallSeverity(differences),
      comparison_time_ms: Date.now() - started,
    };
  }
}

export const renewalComparisonService = new RenewalComparisonService();
