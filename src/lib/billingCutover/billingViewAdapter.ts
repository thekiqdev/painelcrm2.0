/**
 * Sprint 5.0-22 / 5.0-22B — Adaptador BillingAggregate → ViewModel UI.
 */
import type { BillingAggregate, BillingFinancialEventType } from '@/lib/billingAggregate';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialEvent } from '@/lib/financialEventTypes';
import {
  badgeForEventType,
  cycleKeyFromParts,
  standardStatusLabel,
} from '@/lib/financialEventHelpers';
import { mergeRealAndProjectionEvents } from '@/lib/subscriptionFinancialProjection';
import { mapAggregateEventType } from './adapters/eventTypeMap';

function ymdHead(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

function mapAggregateEventToFinancialEvent(
  ev: BillingAggregate['events'][number],
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): FinancialEvent | null {
  const type = mapAggregateEventType(ev.eventType);
  if (!type) return null;
  const ymd = ev.dueYmd;
  const overdue = type === 'invoice_due' && Boolean(ymd && ymd < todayYmd);
  const competence =
    ev.metadata.periodStart?.slice(0, 7) ??
    (ymd.length >= 7 ? ymd.slice(0, 7) : null);
  const statusLabel =
    ev.eventType === 'cycle_skipped'
      ? 'Ignorado'
      : standardStatusLabel(type, overdue);
  return {
    id: ev.id,
    kind: 'real',
    type,
    ymd,
    dueYmd: ymd,
    amountCents: ev.metadata.amount ?? detail.subscription.amount_cents,
    competence,
    invoiceId: ev.metadata.invoiceId,
    cycleId: ev.cycleId,
    statusLabel,
    statusBadge: badgeForEventType(type, overdue),
    gateway: detail.subscription.gateway,
    notes: ev.metadata.errorMessage ?? ev.metadata.skippedReason,
    paidAt: type === 'payment' ? ymdHead(ev.occurredAt) : null,
    clientName: detail.client_name ?? null,
    lastUpdatedAt: ev.occurredAt,
    cycleKey: cycleKeyFromParts(ev.cycleId, ymd, competence),
  };
}

function mapProjectedCalendarToFinancialEvent(
  entry: BillingAggregate['calendar'][number],
  detail: CrmSubscriptionDetailPayload
): FinancialEvent {
  const ymd = entry.date;
  const competence = ymd.length >= 7 ? ymd.slice(0, 7) : null;
  const statusLabel =
    detail.subscription.status === 'paused' ? 'Pausada' : 'Prevista';
  return {
    id: entry.eventId,
    kind: 'projected',
    type: 'upcoming_cycle',
    ymd,
    dueYmd: ymd,
    amountCents: entry.metadata.amount ?? detail.subscription.amount_cents,
    competence,
    invoiceId: null,
    cycleId: entry.cycleId,
    statusLabel,
    statusBadge: badgeForEventType('upcoming_cycle'),
    gateway: detail.subscription.gateway,
    notes: entry.metadata.skippedReason,
    paidAt: null,
    clientName: detail.client_name ?? null,
    lastUpdatedAt: null,
    cycleKey: cycleKeyFromParts(entry.cycleId, ymd, competence),
  };
}

export type BillingStoreEvents = {
  realEvents: FinancialEvent[];
  events: FinancialEvent[];
};

export function buildStoreEventsFromAggregate(
  aggregate: BillingAggregate,
  detail: CrmSubscriptionDetailPayload
): BillingStoreEvents {
  const realEvents = aggregate.events
    .map((ev) => mapAggregateEventToFinancialEvent(ev, detail, aggregate.todayYmd))
    .filter((ev): ev is FinancialEvent => ev != null);

  const projected = aggregate.calendar
    .filter((e) => e.isProjected)
    .map((e) => mapProjectedCalendarToFinancialEvent(e, detail));

  const events = mergeRealAndProjectionEvents(realEvents, projected);
  return { realEvents, events };
}

export type BillingExperienceViewModel = {
  aggregate: BillingAggregate;
  storeEvents: BillingStoreEvents;
};

export function buildBillingExperienceViewModel(
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string,
  aggregate: BillingAggregate
): BillingExperienceViewModel {
  return {
    aggregate,
    storeEvents: buildStoreEventsFromAggregate(aggregate, detail),
  };
}

export type { BillingFinancialEventType };
