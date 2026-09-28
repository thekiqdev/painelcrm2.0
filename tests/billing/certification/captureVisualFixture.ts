import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { createFinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { cycleCanGenerateFromUiCapabilities } from '@/lib/billingCutover/adapters/uiCapabilitiesAdapter';
import { isProjectedFinancialEvent } from '@/lib/subscriptionFinancialProjection';
import type { FinancialEvent } from '@/lib/financialEventTypes';

export type HistoryVisualRow = {
  cycleId: string | null;
  invoiceId: string | null;
  dueYmd: string | null;
  statusPt: string;
  canGenerateNow: boolean;
  isProjected: boolean;
  eventType: string | null;
};

export type CalendarVisualEvent = {
  id: string;
  ymd: string;
  cycleId: string | null;
  invoiceId: string | null;
  isProjected: boolean;
  supportsGenerate: boolean;
  type: string;
};

export type SidebarVisual = {
  alertKinds: string[];
  alertCount: number;
  nextReceiptDate: string;
  openAmount: string;
};

export type NextInvoiceVisual = {
  cycleId: string | null;
  invoiceId: string | null;
  isProjected: boolean;
  dueYmd: string | null;
  statusLabel: string;
  showGenerate: boolean;
};

export type FinancialEventVisual = {
  id: string;
  type: string;
  kind: string;
  cycleId: string | null;
  invoiceId: string | null;
  ymd: string;
  dueYmd: string | null;
};

export type BillingVisualFixture = {
  scenarioId: string;
  todayYmd: string;
  history: {
    rowCount: number;
    rows: HistoryVisualRow[];
    generateCycleIds: string[];
  };
  calendar: {
    eventCount: number;
    events: CalendarVisualEvent[];
    projectedCount: number;
  };
  sidebar: SidebarVisual;
  nextInvoice: NextInvoiceVisual;
  financialEvents: {
    realCount: number;
    projectedCount: number;
    events: FinancialEventVisual[];
  };
};

export type CertificationContext = {
  detail: CrmSubscriptionDetailPayload;
  todayYmd: string;
  store: ReturnType<typeof createFinancialEventStore>;
  realEvents: FinancialEvent[];
  allEvents: FinancialEvent[];
  visual: BillingVisualFixture;
};

function eventKind(ev: FinancialEvent): string {
  return ev.kind ?? 'real';
}

export function captureBillingVisualFixture(
  scenarioId: string,
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): BillingVisualFixture {
  const store = createFinancialEventStore(detail, todayYmd);
  const allEvents = store.events;
  const historyRows = store.getHistoryRows();
  const calendarEvents = store.getCalendarEvents();
  const next = store.getNextChargePresentation();
  const summary = store.getSidebarSummary();
  const alerts = store.getFinancialAlerts();

  const history: HistoryVisualRow[] = historyRows.map((r) => ({
    cycleId: r.cycleId,
    invoiceId: r.invoiceId,
    dueYmd: r.dueYmd,
    statusPt: r.statusPt,
    canGenerateNow: r.canGenerateNow,
    isProjected: r.isProjected,
    eventType: r.eventType ?? null,
  }));

  const eventById = new Map(allEvents.map((ev) => [ev.id, ev]));

  const calendar: CalendarVisualEvent[] = calendarEvents.map((ev) => {
    const source = eventById.get(ev.id);
    const caps = store.getUiCapabilities();
    const supportsGenerate = caps
      ? cycleCanGenerateFromUiCapabilities(caps, ev.cycleId)
      : false;
    return {
      id: ev.id,
      ymd: ev.ymd,
      cycleId: ev.cycleId ?? null,
      invoiceId: ev.invoiceId ?? null,
      isProjected: ev.isProjected ?? false,
      supportsGenerate,
      type: source?.type ?? ev.kind,
    };
  });

  const realEvents = store.realEvents;

  const nextShowGenerate =
    detail.subscription.status === 'active' &&
    !next.isProjected &&
    Boolean(next.cycleId) &&
    !next.hasInvoice;

  return {
    scenarioId,
    todayYmd,
    history: {
      rowCount: historyRows.length,
      rows: history,
      generateCycleIds: history.filter((r) => r.canGenerateNow).map((r) => r.cycleId!).sort(),
    },
    calendar: {
      eventCount: calendarEvents.length,
      events: calendar,
      projectedCount: calendar.filter((e) => e.isProjected).length,
    },
    sidebar: {
      alertKinds: alerts.map((a) => a.kind).sort(),
      alertCount: alerts.length,
      nextReceiptDate: summary.nextReceiptDate,
      openAmount: summary.openAmount,
    },
    nextInvoice: {
      cycleId: next.cycleId,
      invoiceId: next.invoiceId,
      isProjected: next.isProjected ?? false,
      dueYmd: next.dueYmd,
      statusLabel: next.statusLabel,
      showGenerate: nextShowGenerate,
    },
    financialEvents: {
      realCount: realEvents.length,
      projectedCount: allEvents.filter(isProjectedFinancialEvent).length,
      events: allEvents.map((ev) => ({
        id: ev.id,
        type: ev.type,
        kind: eventKind(ev),
        cycleId: ev.cycleId,
        invoiceId: ev.invoiceId,
        ymd: ev.ymd,
        dueYmd: ev.dueYmd,
      })),
    },
  };
}

export function buildCertificationContext(
  scenarioId: string,
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): CertificationContext {
  const store = createFinancialEventStore(detail, todayYmd);
  const visual = captureBillingVisualFixture(scenarioId, detail, todayYmd);
  return {
    detail,
    todayYmd,
    store,
    realEvents: store.realEvents,
    allEvents: store.events,
    visual,
  };
}
