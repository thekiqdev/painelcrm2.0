/**
 * Billing Engine V2 — Sprint 2.4B: assertions obrigatórias por cenário.
 */
import type { BillingConsistencyResult } from '../../../billingConsistency/types.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { BillingCutoverDecision } from '../billingCutover/types.js';
import type { ProjectionResult } from '../../../billingProjection/types.js';
import type { MigrationSimulationRecommendation } from '../billingMigrationSimulator/types.js';
import type { RenewalComparisonResult } from '../billingShadow/types.js';
import type { AssertionResult } from './types.js';

function assert(name: string, passed: boolean, message?: string, detail?: Record<string, unknown>): AssertionResult {
  return { name, passed, message, detail };
}

export function runScenarioAssertions(params: {
  context: BillingExecutionContext;
  projection: ProjectionResult;
  consistency: BillingConsistencyResult;
  shadow: RenewalComparisonResult;
  simulatorRecommendation: MigrationSimulationRecommendation;
  cutover: BillingCutoverDecision;
  certification: { certified: boolean; score: number };
}): AssertionResult[] {
  const { context, projection, consistency, shadow, simulatorRecommendation, cutover, certification } =
    params;
  const invoice = projection.projectedInvoice;
  const results: AssertionResult[] = [];

  results.push(
    assert('execution_context_ready', context.diagnostics.errors.length === 0, 'Context sem errors'),
    assert('execution_context_engine', context.diagnostics.engineReady, 'engineReady'),
    assert('projection_approved', projection.approved, 'Projection approved'),
    assert('projection_hash', Boolean(projection.diagnostics.hash), 'Projection hash presente'),
    assert('consistency_approved', consistency.approved, 'Consistency approved'),
    assert('consistency_confidence_100', consistency.confidence === 100, `confidence=${consistency.confidence}`),
    assert('shadow_approved', shadow.approved, 'Shadow approved'),
    assert('shadow_score_100', shadow.score === 100, `shadow score=${shadow.score}`),
    assert(
      'shadow_no_critical',
      !shadow.differences.some((d) => d.severity === 'CRITICAL' || d.severity === 'ERROR'),
      'Sem divergências ERROR/CRITICAL'
    ),
    assert(
      'simulator_ready',
      simulatorRecommendation === 'READY_TO_MIGRATE',
      `simulator=${simulatorRecommendation}`
    ),
    assert('cutover_approved', cutover.approved, 'Cutover approved'),
    assert(
      'cutover_enable_v2',
      cutover.featureFlagRecommendation === 'ENABLE_V2',
      `flag=${cutover.featureFlagRecommendation}`
    ),
    assert('certification_certified', certification.certified, 'Certification CERTIFIED'),
    assert('certification_score_100', certification.score === 100, `score=${certification.score}`),
    assert('invoice_present', Boolean(invoice), 'Projected invoice'),
    assert('invoice_items', invoice.invoiceItems.length >= 0, `items=${invoice.invoiceItems.length}`),
    assert('invoice_subtotal', invoice.subtotal >= 0, `subtotal=${invoice.subtotal}`),
    assert('invoice_total', invoice.grandTotal >= 0, `total=${invoice.grandTotal}`),
    assert('invoice_dates', Boolean(invoice.dueDate && invoice.period.periodStart), 'Datas presentes'),
    assert(
      'definition_hash',
      invoice.invoiceItems.every((it) => Boolean(it.definitionHash)),
      'Definition hash em todos os itens'
    ),
    assert(
      'item_revision',
      invoice.invoiceItems.every((it) => it.effectiveRevision >= 1),
      'Revision em todos os itens'
    ),
    assert('gateway_payload', invoice.gateway != null, 'Gateway payload'),
    assert('notifications_payload', invoice.notifications != null, 'Notifications payload'),
    assert('timeline', Array.isArray(invoice.timeline), 'Timeline'),
    assert('history', Array.isArray(invoice.history), 'History')
  );

  return results;
}

export function allAssertionsPassed(assertions: AssertionResult[]): boolean {
  return assertions.every((a) => a.passed);
}
