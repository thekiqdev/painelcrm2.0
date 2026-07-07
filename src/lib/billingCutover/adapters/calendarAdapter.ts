import type { BillingAggregate, BillingCalendarSnapshot } from '@/lib/billingAggregate';
import type { FinancialCalendarEvent, FinancialCalendarKind } from '@/lib/subscriptionFinancialExperience';
import {
  eventEmoji,
  eventToCalendarKind,
  timelineTitle,
} from '@/lib/financialEventHelpers';
import { mapAggregateEventType } from './eventTypeMap';
import { billingStatusLabel } from '@/lib/billingStatusPresentation';
import { invoiceVisibilityFromCycle, cycleNeedsInvariantRepair } from '@/lib/resolvedCompetencyPresentation';

function calendarKindFromEntry(
  entry: BillingCalendarSnapshot,
  todayYmd: string
): FinancialCalendarKind {
  const legacyType = mapAggregateEventType(entry.eventType);
  if (entry.isProjected) return 'due';
  if (!legacyType) return 'due';
  const overdue = legacyType === 'invoice_due' && entry.date < todayYmd;
  return eventToCalendarKind(legacyType, overdue);
}

function statusPtFromEntry(entry: BillingCalendarSnapshot, todayYmd: string): string {
  if (entry.isProjected) return 'Prevista';
  const legacyType = mapAggregateEventType(entry.eventType);
  const overdue = legacyType === 'invoice_due' && entry.date < todayYmd;
  return billingStatusLabel({
    eventType: legacyType ?? entry.eventType,
    overdue,
    isProjected: entry.isProjected,
    fallback: entry.status,
  });
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

function mapCalendarEntry(
  entry: BillingCalendarSnapshot,
  aggregate: BillingAggregate,
  caps: BillingUiCapabilities
): FinancialCalendarEvent {
  const legacyType = mapAggregateEventType(entry.eventType) ?? 'upcoming_cycle';
  const overdue = legacyType === 'invoice_due' && entry.date < aggregate.todayYmd;
  const kind = calendarKindFromEntry(entry, aggregate.todayYmd);

  const cycle = entry.cycleId ? aggregate.cycles.find((c) => c.id === entry.cycleId) : null;
  const needsInvariantRepair = cycle
    ? cycleNeedsInvariantRepair(cycle.status, cycle.invoiceId)
    : false;

  return {
    id: entry.eventId,
    ymd: entry.date,
    kind,
    emoji: eventEmoji(legacyType),
    title: entry.isProjected ? 'Prevista' : timelineTitle(legacyType),
    amountCents: entry.metadata.amount ?? aggregate.subscription.amount,
    competence:
      entry.metadata.periodStart?.slice(0, 7) ??
      (entry.date.length >= 7 ? entry.date.slice(0, 7) : null),
    invoiceId: entry.metadata.invoiceId,
    statusPt: statusPtFromEntry(entry, aggregate.todayYmd),
    gateway: aggregate.subscription.metadata.gateway,
    paidAt: paidAtYmdFromAggregateEvent(aggregate, entry.eventId),
    clientName: null,
    lastUpdatedAt: null,
    cycleId: entry.cycleId,
    notes: entry.metadata.errorMessage ?? entry.metadata.skippedReason,
    isProjected: entry.isProjected,
    needsInvariantRepair,
  };
}

/** Calendar direto do Aggregate — sem reconstrução via events. */
export function buildCalendarEventsFromAggregate(
  aggregate: BillingAggregate,
  caps: BillingUiCapabilities
): FinancialCalendarEvent[] {
  void caps;
  return aggregate.calendar.map((entry) => mapCalendarEntry(entry, aggregate, caps));
}

export function calendarSupportsGenerate(
  entry: BillingCalendarSnapshot,
  aggregate: BillingAggregate
): boolean {
  if (entry.isProjected) return false;
  if (!entry.cycleId) return false;
  const cycle = aggregate.cycles.find((c) => c.id === entry.cycleId);
  if (cycle && cycleNeedsInvariantRepair(cycle.status, cycle.invoiceId)) return false;
  return invoiceVisibilityFromCycle(cycle?.invoiceId ?? null, aggregate.subscription.status).canGenerate;
}
