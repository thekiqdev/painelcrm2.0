import type { BillingFinancialEventType } from '@/lib/billingAggregate';
import type { FinancialEventType } from '@/lib/financialEventTypes';

/** Mapa Aggregate → FinancialEventType (adapter only — sem alterar Aggregate). */
export const AGGREGATE_TO_LEGACY_EVENT_TYPE: Partial<
  Record<BillingFinancialEventType, FinancialEventType>
> = {
  payment: 'payment',
  invoice_generated: 'invoice_generated',
  invoice_due: 'invoice_due',
  invoice_failed: 'invoice_failed',
  manual_charge: 'manual_charge',
  invoice_refunded: 'invoice_refunded',
  upcoming_cycle: 'upcoming_cycle',
  cycle_pending: 'upcoming_cycle',
  cycle_queued: 'upcoming_cycle',
  cycle_processing: 'upcoming_cycle',
  cycle_cancelled: 'invoice_cancelled',
  cycle_skipped: 'invoice_cancelled',
  cycle_unknown: 'upcoming_cycle',
};

export function mapAggregateEventType(
  eventType: BillingFinancialEventType
): FinancialEventType | null {
  return AGGREGATE_TO_LEGACY_EVENT_TYPE[eventType] ?? null;
}
