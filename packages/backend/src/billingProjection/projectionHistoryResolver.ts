/**
 * Billing Engine V2 — Sprint 2.3D: resolve payload de histórico (puro).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { NormalizedHistoryEvent } from '../internal-tools/billing-migration/billingShadow/types.js';

export function resolveProjectionHistory(
  context: BillingExecutionContext,
  grandTotal: number
): NormalizedHistoryEvent[] {
  if (grandTotal <= 0) return [];
  if (context.history.changes.length > 0) {
    return context.history.changes.map((c) => ({
      change: c.change,
      audit: c.audit,
    }));
  }
  return [
    {
      change: 'subscription_cycle_advanced',
      audit: { cycle_key: context.cycle, simulated: true },
    },
  ];
}
