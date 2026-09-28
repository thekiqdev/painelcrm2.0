import type { BillingAggregate } from '@/lib/billingAggregate';
import type { FinancialEventStore } from '@/lib/subscriptionFinancialEventStore';

/** Snapshot serializável do motor legado (FinancialEventStore). */
export type LegacyShadowSnapshot = {
  engine: 'legacy';
  subscriptionId: string;
  todayYmd: string;
  realEventCount: number;
  displayEventCount: number;
  historyCount: number;
  calendarCount: number;
  projectedCalendarCount: number;
  realEventIds: string[];
  historyCycleIds: string[];
  calendarCycleIds: string[];
  nextChargeCycleId: string | null;
  nextChargeInvoiceId: string | null;
  nextChargeIsProjected: boolean;
  nextChargeDueYmd: string | null;
};

/** Snapshot serializável do Billing Aggregate. */
export type AggregateShadowSnapshot = {
  engine: 'aggregate';
  subscriptionId: string;
  todayYmd: string;
  eventCount: number;
  historyCount: number;
  calendarCount: number;
  projectedCalendarCount: number;
  alertCount: number;
  eventIds: string[];
  historyCycleIds: string[];
  calendarCycleIds: string[];
  nextInvoiceEventId: string | null;
  nextInvoiceCycleId: string | null;
  nextInvoiceDate: string | null;
  nextInvoiceIsProjected: boolean;
  capabilities: {
    canGenerate: boolean;
    canRetry: boolean;
    canPause: boolean;
    canResume: boolean;
  };
  sourceSignature: string;
};

export type ShadowSnapshotPair = {
  legacy: LegacyShadowSnapshot;
  aggregate: AggregateShadowSnapshot | null;
};

/** Serializa o FinancialEventStore para comparação futura (5.0-21A). */
export function buildLegacyShadowSnapshot(store: FinancialEventStore): LegacyShadowSnapshot {
  const history = store.getHistoryRows();
  const calendar = store.getCalendarEvents();
  const next = store.getNextChargePresentation();

  return {
    engine: 'legacy',
    subscriptionId: store.subscriptionId,
    todayYmd: store.today,
    realEventCount: store.realEvents.length,
    displayEventCount: store.events.length,
    historyCount: history.length,
    calendarCount: calendar.length,
    projectedCalendarCount: calendar.filter((e) => e.isProjected).length,
    realEventIds: store.realEvents.map((e) => e.id).sort(),
    historyCycleIds: history.map((r) => r.cycleId ?? '').filter(Boolean).sort(),
    calendarCycleIds: calendar
      .map((e) => e.cycleId ?? '')
      .filter(Boolean)
      .sort(),
    nextChargeCycleId: next.cycleId,
    nextChargeInvoiceId: next.invoiceId,
    nextChargeIsProjected: next.isProjected ?? false,
    nextChargeDueYmd: next.dueYmd,
  };
}

/** Serializa o BillingAggregate para comparação futura (5.0-21A). */
export function buildAggregateShadowSnapshot(
  aggregate: BillingAggregate
): AggregateShadowSnapshot {
  return {
    engine: 'aggregate',
    subscriptionId: aggregate.subscriptionId,
    todayYmd: aggregate.todayYmd,
    eventCount: aggregate.events.filter((e) => e.kind === 'real').length,
    historyCount: aggregate.history.length,
    calendarCount: aggregate.calendar.length,
    projectedCalendarCount: aggregate.calendar.filter((e) => e.isProjected).length,
    alertCount: aggregate.alerts.length,
    eventIds: aggregate.events.map((e) => e.id).sort(),
    historyCycleIds: aggregate.history.map((r) => r.cycleId).sort(),
    calendarCycleIds: aggregate.calendar
      .map((e) => e.cycleId ?? '')
      .filter(Boolean)
      .sort(),
    nextInvoiceEventId: aggregate.nextInvoice?.eventId ?? null,
    nextInvoiceCycleId: aggregate.nextInvoice?.cycleId ?? null,
    nextInvoiceDate: aggregate.nextInvoice?.date ?? null,
    nextInvoiceIsProjected: aggregate.nextInvoice?.isProjected ?? false,
    capabilities: {
      canGenerate: aggregate.capabilities.canGenerate,
      canRetry: aggregate.capabilities.canRetry,
      canPause: aggregate.capabilities.canPause,
      canResume: aggregate.capabilities.canResume,
    },
    sourceSignature: aggregate.sourceSignature,
  };
}
