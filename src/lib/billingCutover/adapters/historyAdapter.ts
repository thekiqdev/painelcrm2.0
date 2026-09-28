import type { BillingAggregate, BillingHistorySnapshot } from '@/lib/billingAggregate';
import type { CalendarVisualKind, FinancialHistoryRow } from '@/lib/billingSubscriptionExperience';
import type { FinancialEventType } from '@/lib/financialEventTypes';
import { billingStatusLabel } from '@/lib/billingStatusPresentation';
import { invoiceVisibilityFromCycle, cycleNeedsInvariantRepair } from '@/lib/resolvedCompetencyPresentation';
import { mapAggregateEventType } from './eventTypeMap';
import type { BillingUiCapabilities } from './uiCapabilitiesAdapter';

function visualFromAggregateRow(
  row: BillingHistorySnapshot,
  todayYmd: string
): CalendarVisualKind {
  const legacyType = mapAggregateEventType(row.type);
  if (legacyType === 'payment') return 'paid';
  if (legacyType === 'invoice_failed') return 'overdue';
  if (legacyType === 'invoice_cancelled' || row.type === 'cycle_skipped') return 'cancelled';
  if (legacyType === 'invoice_refunded') return 'cancelled';
  if (legacyType === 'invoice_due' && row.date < todayYmd) return 'overdue';
  if (legacyType === 'invoice_generated' || legacyType === 'manual_charge') return 'generated';
  return 'future';
}

function statusPtFromAggregateRow(row: BillingHistorySnapshot, todayYmd: string): string {
  const legacyType = mapAggregateEventType(row.type);
  const overdue = legacyType === 'invoice_due' && row.date < todayYmd;
  return billingStatusLabel({
    cycleStatus: row.status,
    eventType: legacyType ?? row.type,
    overdue,
    fallback: row.title,
  });
}

function cycleInvoiceRowActions(
  aggregate: BillingAggregate,
  cycleId: string | null | undefined
): {
  canGenerateNow: boolean;
  canOpenNow: boolean;
  invoiceId: string | null;
  needsInvariantRepair: boolean;
} {
  const cycle = cycleId ? aggregate.cycles.find((c) => c.id === cycleId) : null;
  const invoiceId = cycle?.invoiceId?.trim() || null;
  if (cycle && cycleNeedsInvariantRepair(cycle.status, cycle.invoiceId)) {
    return {
      invoiceId: null,
      canGenerateNow: false,
      canOpenNow: false,
      needsInvariantRepair: true,
    };
  }
  const allowNewCharge = aggregateAllowsNewCharge(aggregate);
  const vis = invoiceVisibilityFromCycle(invoiceId, aggregate.subscription.status, {
    allowNewCharge,
  });
  return {
    invoiceId,
    canGenerateNow: vis.canGenerate,
    canOpenNow: vis.canOpen,
    needsInvariantRepair: false,
  };
}

function aggregateAllowsNewCharge(aggregate: BillingAggregate): boolean {
  const status = aggregate.subscription.status;
  if (status === 'cancelled' || status === 'completed') return false;
  if (aggregate.subscription.cyclesUnlimited !== false) return true;
  const max = aggregate.subscription.maxCycles;
  if (max == null || max < 1) return true;
  const emitted = aggregate.cycles.filter((c) => Boolean(c.invoiceId?.trim())).length;
  return emitted < Math.trunc(max);
}

function paidAtYmdFromAggregateEvent(
  aggregate: BillingAggregate,
  eventId: string
): string | null {
  const event = aggregate.events.find((e) => e.id === eventId);
  if (!event || event.eventType !== 'payment') return null;
  const head = event.occurredAt?.slice(0, 10);
  return head && /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

function mapHistoryRow(
  row: BillingHistorySnapshot,
  aggregate: BillingAggregate,
  _caps: import('./uiCapabilitiesAdapter').BillingUiCapabilities,
  todayYmd: string
): FinancialHistoryRow {
  const legacyType = mapAggregateEventType(row.type);
  const nextCycleId =
    aggregate.nextInvoice && !aggregate.nextInvoice.isProjected
      ? aggregate.nextInvoice.cycleId
      : null;
  const invoiceActions = cycleInvoiceRowActions(aggregate, row.cycleId);
  const competence =
    row.metadata.periodStart?.slice(0, 7) ??
    (row.date.length >= 7 ? row.date.slice(0, 7) : '—');

  return {
    id: invoiceActions.invoiceId ?? row.cycleId ?? row.id,
    competence,
    amountCents: row.metadata.amount ?? aggregate.subscription.amount,
    dueYmd: row.date,
    paidAt: paidAtYmdFromAggregateEvent(aggregate, row.eventId),
    statusPt: statusPtFromAggregateRow(row, todayYmd),
    gateway: aggregate.subscription.metadata.gateway,
    invoiceId: invoiceActions.invoiceId,
    cycleId: row.cycleId,
    visual: visualFromAggregateRow(row, todayYmd),
    notes: row.metadata.errorMessage ?? row.metadata.skippedReason,
    jobId: row.metadata.jobId,
    eventType: (legacyType ?? 'upcoming_cycle') as FinancialEventType,
    isNextCharge: Boolean(nextCycleId && row.cycleId === nextCycleId),
    canGenerateNow: invoiceActions.canGenerateNow,
    canOpenNow: invoiceActions.canOpenNow,
    canReprocessNow: false,
    isProjected: false,
    needsInvariantRepair: invoiceActions.needsInvariantRepair,
  };
}

/** History direto do Aggregate — sem recomputação. */
export function buildHistoryRowsFromAggregate(
  aggregate: BillingAggregate,
  caps: BillingUiCapabilities
): FinancialHistoryRow[] {
  return aggregate.history.map((row) =>
    mapHistoryRow(row, aggregate, caps, aggregate.todayYmd)
  );
}
