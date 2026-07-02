import type { FinancialEvent } from './financialEventTypes';
import type { FinancialTimelineItem, FinancialTimelineMonthGroup } from './subscriptionFinancialExperience';

export type TimelineTemporalBand =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'future_months'
  | 'history';

export type TimelineMonthBucket = 'current' | 'future' | 'past';

export type TimelineMonthSection = {
  monthKey: string;
  monthLabel: string;
  bucket: TimelineMonthBucket;
  items: FinancialTimelineItem[];
  summaryTitle: string;
  totalCents: number;
  count: number;
  defaultOpen: boolean;
  band: TimelineTemporalBand;
};

export type TimelineLayout = {
  presentAndFuture: TimelineMonthSection[];
  pastMonths: TimelineMonthSection[];
  initialOpenMonthKey: string | null;
  focusEventId: string | null;
  hasPastHistory: boolean;
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

export function temporalBandForYmd(ymd: string, todayYmd: string): TimelineTemporalBand {
  if (ymd === todayYmd) return 'today';
  const today = parseYmd(todayYmd);
  const d = parseYmd(ymd);
  if (d < today) return 'history';
  const weekEnd = addDays(today, 7);
  if (d <= weekEnd) return 'this_week';
  if (ymd.slice(0, 7) === todayYmd.slice(0, 7)) return 'this_month';
  return 'future_months';
}

export function temporalBandLabel(band: TimelineTemporalBand): string {
  const map: Record<TimelineTemporalBand, string> = {
    today: 'Hoje',
    this_week: 'Esta semana',
    this_month: 'Este mês',
    future_months: 'Próximos meses',
    history: 'Histórico',
  };
  return map[band];
}

export function itemBandLabel(item: FinancialTimelineItem, todayYmd: string): string | null {
  return temporalBandLabel(temporalBandForYmd(item.ymd, todayYmd));
}

export function shouldShowBandSeparator(
  items: FinancialTimelineItem[],
  index: number,
  todayYmd: string
): string | null {
  if (index === 0) {
    const band = temporalBandForYmd(items[0].ymd, todayYmd);
    return temporalBandLabel(band);
  }
  const prev = temporalBandForYmd(items[index - 1].ymd, todayYmd);
  const curr = temporalBandForYmd(items[index].ymd, todayYmd);
  if (prev === curr) return null;
  return temporalBandLabel(curr);
}

function monthLabelFromKey(monthKey: string): string {
  const mi = Number(monthKey.slice(5, 7)) - 1;
  return mi >= 0 && mi < 12 ? MONTH_NAMES[mi] : monthKey;
}

function monthBucket(monthKey: string, currentMonthKey: string): TimelineMonthBucket {
  if (monthKey === currentMonthKey) return 'current';
  if (monthKey > currentMonthKey) return 'future';
  return 'past';
}

export function resolveFocusEventId(events: FinancialEvent[], todayYmd: string): string | null {
  const priority: FinancialEvent['type'][] = [
    'invoice_failed',
    'charge_attempt',
    'invoice_due',
    'upcoming_cycle',
    'payment',
  ];
  for (const type of priority) {
    const candidates = events.filter((e) => e.type === type);
    if (type === 'invoice_due') {
      const overdue = candidates.find((e) => e.dueYmd && e.dueYmd < todayYmd);
      if (overdue) return overdue.id;
      const todayDue = candidates.find((e) => e.ymd === todayYmd || e.dueYmd === todayYmd);
      if (todayDue) return todayDue.id;
      const pending = candidates.sort((a, b) => a.ymd.localeCompare(b.ymd))[0];
      if (pending) return pending.id;
      continue;
    }
    if (type === 'upcoming_cycle') {
      const todayCycle = candidates.find((e) => e.ymd === todayYmd);
      if (todayCycle) return todayCycle.id;
      continue;
    }
    if (candidates.length > 0) {
      const sorted = [...candidates].sort((a, b) => {
        if (type === 'payment') return b.ymd.localeCompare(a.ymd);
        return a.ymd.localeCompare(b.ymd);
      });
      return sorted[0].id;
    }
  }
  return null;
}

export function buildTimelineFinancialSections(
  groups: FinancialTimelineMonthGroup[],
  events: FinancialEvent[],
  todayYmd: string
): TimelineLayout {
  const currentMonthKey = todayYmd.slice(0, 7);
  const focusEventId = resolveFocusEventId(events, todayYmd);

  const sections: TimelineMonthSection[] = groups.map((g) => {
    const bucket = monthBucket(g.monthKey, currentMonthKey);
    const band: TimelineTemporalBand =
      bucket === 'current'
        ? 'this_month'
        : bucket === 'future'
          ? 'future_months'
          : 'history';
    const items =
      bucket === 'current'
        ? [...g.items].sort((a, b) => a.ymd.localeCompare(b.ymd))
        : bucket === 'future'
          ? [...g.items].sort((a, b) => a.ymd.localeCompare(b.ymd))
          : [...g.items].sort((a, b) => b.ymd.localeCompare(a.ymd));

    return {
      monthKey: g.monthKey,
      monthLabel: g.monthLabel || monthLabelFromKey(g.monthKey),
      bucket,
      items,
      summaryTitle: g.summaryTitle,
      totalCents: g.totalCents,
      count: g.count,
      defaultOpen: bucket === 'current',
      band,
    };
  });

  const presentAndFuture = sections
    .filter((s) => s.bucket !== 'past')
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const pastMonths = sections
    .filter((s) => s.bucket === 'past')
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  let initialOpenMonthKey: string | null = currentMonthKey;
  if (focusEventId) {
    const focusEv = events.find((e) => e.id === focusEventId);
    if (focusEv) initialOpenMonthKey = focusEv.ymd.slice(0, 7);
  }

  return {
    presentAndFuture,
    pastMonths,
    initialOpenMonthKey,
    focusEventId,
    hasPastHistory: pastMonths.length > 0,
  };
}

export function timelineHistoryGateLabel(pastMonthCount: number): string {
  return pastMonthCount === 1
    ? 'Ver histórico anterior'
    : `Ver histórico anterior (${pastMonthCount} meses)`;
}

export function slicePastMonthsForLazy(
  pastMonths: TimelineMonthSection[],
  historyExpanded: boolean
): TimelineMonthSection[] {
  return historyExpanded ? pastMonths : [];
}

export function futureMonthsVirtualWindow(
  sections: TimelineMonthSection[],
  maxVisible = 6
): { visible: TimelineMonthSection[]; hiddenCount: number } {
  const future = sections.filter((s) => s.bucket === 'future');
  if (future.length <= maxVisible) {
    return { visible: sections, hiddenCount: 0 };
  }
  const current = sections.filter((s) => s.bucket === 'current');
  const trimmedFuture = future.slice(0, maxVisible);
  return {
    visible: [...current, ...trimmedFuture],
    hiddenCount: future.length - maxVisible,
  };
}
