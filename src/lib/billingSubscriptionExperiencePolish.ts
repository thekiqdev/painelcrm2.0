import { formatYmdBrSafe, isValidYmd } from '@/lib/billingSafeDate';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  buildBusinessTimelineEvents,
  buildCalendarMonths,
  buildFinancialHistoryRows,
  buildFutureCycles,
  normalizeYmdInput,
  resolveGenerationYmd,
  subscriptionHeadlineStatus,
  type BusinessTimelineEvent,
  type CalendarEvent,
  type FinancialHistoryRow,
} from './billingSubscriptionExperience';

export type HealthState = 'healthy' | 'attention' | 'error' | 'paused' | 'cancelled';

export type HealthScoreResult = {
  score: number;
  label: string;
  state: HealthState;
  factors: {
    punctualityPct: number;
    failureCount: number;
    overdueCount: number;
    retryCount: number;
    paidCount: number;
  };
};

export type PremiumKpiCard = {
  key: string;
  label: string;
  value: string;
  description: string;
  icon: 'wallet' | 'calendar' | 'clock' | 'file' | 'alert' | 'trend';
  comparisonPct: number | null;
  comparisonLabel: string | null;
  accent?: 'positive' | 'negative' | 'neutral' | 'warning';
};

export type CalendarGridCell = {
  ymd: string | null;
  day: number | null;
  isToday: boolean;
  inMonth: boolean;
  events: CalendarEvent[];
};

export type TimelineSmartGroup = {
  id: string;
  monthKey: string;
  monthLabelPt: string;
  icon: string;
  title: string;
  count: number;
  events: BusinessTimelineEvent[];
};

export type HistoryFilter = 'all' | 'paid' | 'pending' | 'overdue' | 'cancelled';
export type HistorySort = 'due_desc' | 'due_asc' | 'amount_desc' | 'amount_asc';

export type FutureTimelineStep = {
  id: string;
  ymd: string | null;
  label: string;
  sublabel?: string;
  highlight?: boolean;
  amountCents?: number;
};

export type RevenueChartMonth = {
  monthKey: string;
  name: string;
  receita: number;
  pagamentos: number;
  atrasos: number;
};

export type SidebarHealthMetrics = {
  healthScore: HealthScoreResult;
  lastPaymentLabel: string;
  nextReceiptLabel: string;
  daysUntilCharge: number | null;
  annualProjectedCents: number;
  financialHealthLabel: string;
};

export type ExperienceEmptyKind =
  | 'history'
  | 'billing'
  | 'payment'
  | 'forecast'
  | 'calendar'
  | null;

const MONTH_SHORT_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCentsBr(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatCentsCompact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `R$ ${Math.round(v)}`;
}

export function clientInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatNextChargePremium(ymd: string | null | undefined): string {
  const d = normalizeYmdInput(ymd);
  if (!d) return '—';
  const day = Number(d.slice(8, 10));
  const mi = Number(d.slice(5, 7)) - 1;
  if (mi < 0 || mi > 11) return formatYmdBrSafe(d);
  return `${day} ${MONTH_SHORT_PT[mi]}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yS, mS] = monthKey.split('-');
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10) - 1;
  const dt = new Date(Date.UTC(y, m + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyToLabelPt(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return monthKey;
  return `${MONTH_NAMES_PT[mi]} ${y}`;
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00Z`);
  const b = new Date(`${toYmd}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function isRowPaid(row: CrmSubscriptionTimelineRow): boolean {
  return (row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid';
}

function isRowOverdue(row: CrmSubscriptionTimelineRow, today: string): boolean {
  if (isRowPaid(row)) return false;
  const due = normalizeYmdInput(row.due_date);
  return Boolean(due && due < today);
}

function isRowCancelled(row: CrmSubscriptionTimelineRow): boolean {
  return row.operational_state === 'cancelled' || row.operational_state === 'skipped';
}

function paidAmountInMonth(detail: CrmSubscriptionDetailPayload, monthKey: string): number {
  return detail.timeline
    .filter((r) => {
      if (!isRowPaid(r)) return false;
      const paid = normalizeYmdInput(r.processed_at?.slice(0, 10)) ?? normalizeYmdInput(r.due_date);
      return paid?.startsWith(monthKey);
    })
    .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
}

export function computeHealthScore(detail: CrmSubscriptionDetailPayload, todayYmd?: string): HealthScoreResult {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const status = detail.subscription.status;

  if (status === 'cancelled') {
    return {
      score: 0,
      label: 'Cancelada',
      state: 'cancelled',
      factors: { punctualityPct: 0, failureCount: 0, overdueCount: 0, retryCount: 0, paidCount: 0 },
    };
  }
  if (status === 'paused') {
    return {
      score: 50,
      label: 'Pausada',
      state: 'paused',
      factors: { punctualityPct: 50, failureCount: 0, overdueCount: 0, retryCount: 0, paidCount: 0 },
    };
  }

  const rows = detail.timeline.filter((r) => r.merge_source !== 'lifecycle');
  const paidRows = rows.filter(isRowPaid);
  const overdueRows = rows.filter((r) => isRowOverdue(r, today));
  const failedRows = rows.filter(
    (r) => r.operational_state === 'failed' || r.operational_state === 'gateway_failed'
  );
  const retryRows = rows.filter((r) => r.has_auto_retry);

  let onTime = 0;
  let withDue = 0;
  for (const row of paidRows) {
    const due = normalizeYmdInput(row.due_date);
    const paid = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? due;
    if (!due) continue;
    withDue += 1;
    if (paid && paid <= due) onTime += 1;
  }
  const punctualityPct = withDue > 0 ? Math.round((onTime / withDue) * 100) : 100;

  let score = punctualityPct * 0.45;
  score += Math.max(0, 100 - failedRows.length * 12) * 0.2;
  score += Math.max(0, 100 - overdueRows.length * 15) * 0.2;
  score += Math.max(0, 100 - retryRows.length * 8) * 0.1;
  score += Math.min(paidRows.length * 4, 20) * 0.05;

  const rounded = Math.min(100, Math.max(0, Math.round(score)));
  let state: HealthState = 'healthy';
  if (failedRows.length > 0 || rounded < 50) state = 'error';
  else if (overdueRows.length > 0 || rounded < 75) state = 'attention';

  let label = 'Excelente';
  if (rounded < 50) label = 'Crítica';
  else if (rounded < 75) label = 'Atenção';
  else if (rounded < 90) label = 'Boa';

  return {
    score: rounded,
    label,
    state,
    factors: {
      punctualityPct,
      failureCount: failedRows.length,
      overdueCount: overdueRows.length,
      retryCount: retryRows.length,
      paidCount: paidRows.length,
    },
  };
}

export function buildPremiumKpiCards(detail: CrmSubscriptionDetailPayload, todayYmd?: string): PremiumKpiCard[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);
  const prevMonthKey = shiftMonthKey(monthKey, -1);

  const currMonthPaid = paidAmountInMonth(detail, monthKey);
  const prevMonthPaid = paidAmountInMonth(detail, prevMonthKey);
  let comparisonPct: number | null = null;
  if (prevMonthPaid > 0) {
    comparisonPct = Math.round(((currMonthPaid - prevMonthPaid) / prevMonthPaid) * 100);
  } else if (currMonthPaid > 0) {
    comparisonPct = 100;
  }

  const nextDue = normalizeYmdInput(detail.subscription.next_billing_date);
  const openCount = detail.timeline.filter((r) => {
    const inv = (r.invoice_status ?? '').toLowerCase();
    return r.invoice_id && inv !== 'paid' && r.operational_state !== 'paid' && !isRowCancelled(r);
  }).length;

  const health = computeHealthScore(detail, today);

  return [
    {
      key: 'received',
      label: 'Receita recebida',
      value: formatCentsCompact(detail.stats.total_paid_cents),
      description: 'Total acumulado',
      icon: 'wallet',
      comparisonPct,
      comparisonLabel: comparisonPct != null ? 'este mês' : null,
      accent: comparisonPct != null && comparisonPct >= 0 ? 'positive' : comparisonPct != null ? 'negative' : 'neutral',
    },
    {
      key: 'next_charge',
      label: 'Próxima cobrança',
      value: formatNextChargePremium(nextDue),
      description: nextDue ? formatYmdBrSafe(nextDue) : 'Sem data',
      icon: 'calendar',
      comparisonPct: null,
      comparisonLabel: null,
      accent: 'neutral',
    },
    {
      key: 'open',
      label: 'Em aberto',
      value: String(openCount),
      description: formatCentsCompact(detail.stats.total_pending_cents),
      icon: 'clock',
      comparisonPct: null,
      comparisonLabel: null,
      accent: openCount > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'invoiced',
      label: 'Total faturado',
      value: formatCentsCompact(detail.stats.total_invoiced_cents),
      description: `${detail.stats.charge_count} cobrança(s)`,
      icon: 'file',
      comparisonPct: null,
      comparisonLabel: null,
      accent: 'neutral',
    },
    {
      key: 'health',
      label: 'Saúde',
      value: String(health.score),
      description: health.label,
      icon: 'trend',
      comparisonPct: null,
      comparisonLabel: null,
      accent: health.state === 'healthy' ? 'positive' : health.state === 'attention' ? 'warning' : 'negative',
    },
    {
      key: 'status',
      label: 'Status',
      value: subscriptionHeadlineStatus(detail).label,
      description: detail.meta.periodicity_label_pt,
      icon: 'alert',
      comparisonPct: null,
      comparisonLabel: null,
      accent: 'neutral',
    },
  ];
}

export function collectEventsForMonth(detail: CrmSubscriptionDetailPayload, monthKey: string): CalendarEvent[] {
  const months = buildCalendarMonths(detail, 12);
  const found = months.find((m) => m.monthKey === monthKey);
  return found?.events ?? [];
}

export function buildCalendarGrid(
  monthKey: string,
  events: CalendarEvent[],
  todayYmd: string
): CalendarGridCell[] {
  const [yS, mS] = monthKey.split('-');
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mondayStart = (first.getUTCDay() + 6) % 7;
  const cells: CalendarGridCell[] = [];

  for (let i = 0; i < mondayStart; i += 1) {
    cells.push({ ymd: null, day: null, isToday: false, inMonth: false, events: [] });
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const ymd = `${monthKey}-${String(d).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => e.ymd === ymd);
    cells.push({
      ymd,
      day: d,
      isToday: ymd === todayYmd,
      inMonth: true,
      events: dayEvents,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ ymd: null, day: null, isToday: false, inMonth: false, events: [] });
  }

  return cells;
}

const TIMELINE_ICONS: Record<BusinessTimelineEvent['kind'], string> = {
  payment: '💰',
  billing: '🧾',
  lifecycle: '🔁',
  scheduled: '○',
  contract: '📋',
  subscription: '✓',
};

export function timelineEventIcon(kind: BusinessTimelineEvent['kind']): string {
  return TIMELINE_ICONS[kind] ?? '•';
}

export function groupSmartTimeline(events: BusinessTimelineEvent[]): TimelineSmartGroup[] {
  const byMonth = new Map<string, BusinessTimelineEvent[]>();
  for (const ev of events) {
    const mk = ev.ymd.slice(0, 7);
    const list = byMonth.get(mk) ?? [];
    list.push(ev);
    byMonth.set(mk, list);
  }

  const groups: TimelineSmartGroup[] = [];
  for (const [monthKey, monthEvents] of [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    const bucket = new Map<string, BusinessTimelineEvent[]>();
    for (const ev of monthEvents) {
      const key = `${ev.kind}::${ev.title}`;
      const list = bucket.get(key) ?? [];
      list.push(ev);
      bucket.set(key, list);
    }
    for (const [key, evs] of bucket.entries()) {
      const [kind, title] = key.split('::') as [BusinessTimelineEvent['kind'], string];
      const count = evs.length;
      groups.push({
        id: `${monthKey}-${key}`,
        monthKey,
        monthLabelPt: monthKeyToLabelPt(monthKey),
        icon: timelineEventIcon(kind),
        title: count > 1 ? groupTitleWhenSingular(title, count) : title,
        count,
        events: evs.sort((a, b) => a.ymd.localeCompare(b.ymd)),
      });
    }
  }
  return groups;
}

export function historyRowCategory(row: FinancialHistoryRow, todayYmd: string): HistoryFilter {
  if (row.visual === 'cancelled') return 'cancelled';
  if (row.visual === 'paid') return 'paid';
  if (row.visual === 'overdue') return 'overdue';
  const due = row.dueYmd;
  if (due && due < todayYmd && row.visual !== 'paid') return 'overdue';
  return 'pending';
}

export function filterAndSortHistory(
  rows: FinancialHistoryRow[],
  options: {
    filter: HistoryFilter;
    search: string;
    sort: HistorySort;
    todayYmd?: string;
  }
): FinancialHistoryRow[] {
  const today = options.todayYmd ?? new Date().toISOString().slice(0, 10);
  const q = options.search.trim().toLowerCase();

  let result = rows.filter((row) => {
    if (options.filter !== 'all' && historyRowCategory(row, today) !== options.filter) return false;
    if (!q) return true;
    const hay = [
      row.competence,
      row.invoiceId,
      row.amountCents != null ? String(row.amountCents / 100) : '',
      row.statusPt,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  result = [...result].sort((a, b) => {
    switch (options.sort) {
      case 'due_asc':
        return (a.dueYmd ?? '').localeCompare(b.dueYmd ?? '');
      case 'amount_desc':
        return (b.amountCents ?? 0) - (a.amountCents ?? 0);
      case 'amount_asc':
        return (a.amountCents ?? 0) - (b.amountCents ?? 0);
      case 'due_desc':
      default:
        return (b.dueYmd ?? '').localeCompare(a.dueYmd ?? '');
    }
  });

  return result;
}

export function buildFutureTimelineSteps(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FutureTimelineStep[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const cycles = buildFutureCycles(detail, 2);
  if (cycles.length === 0) return [];

  const first = cycles[0];
  const second = cycles[1];
  const steps: FutureTimelineStep[] = [
    { id: 'today', ymd: today, label: 'Hoje', sublabel: formatNextChargePremium(today) },
  ];

  if (first.generationYmd) {
    steps.push({
      id: 'gen-1',
      ymd: first.generationYmd,
      label: 'Gerar cobrança',
      sublabel: formatNextChargePremium(first.generationYmd),
    });
  }
  steps.push({
    id: 'due-1',
    ymd: first.dueYmd,
    label: 'Vencimento',
    sublabel: formatNextChargePremium(first.dueYmd),
    highlight: true,
  });
  steps.push({
    id: 'revenue-1',
    ymd: first.dueYmd,
    label: 'Receita prevista',
    sublabel: formatCentsBr(first.projectedAmountCents),
    amountCents: first.projectedAmountCents,
    highlight: true,
  });

  if (second) {
    steps.push({
      id: 'cycle-2',
      ymd: second.generationYmd ?? second.dueYmd,
      label: 'Novo ciclo',
      sublabel: formatNextChargePremium(second.dueYmd),
    });
    const expectedPay = second.dueYmd;
    steps.push({
      id: 'pay-expected',
      ymd: expectedPay,
      label: 'Pagamento esperado',
      sublabel: formatNextChargePremium(expectedPay),
    });
  }

  return steps;
}

export function buildRevenueChartMonths(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): RevenueChartMonth[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const endMonth = today.slice(0, 7);
  const months: RevenueChartMonth[] = [];

  for (let i = 11; i >= 0; i -= 1) {
    const mk = shiftMonthKey(endMonth, -i);
    const mi = Number(mk.slice(5, 7)) - 1;
    const name = MONTH_SHORT_PT[mi] ?? mk;
    let receita = 0;
    let pagamentos = 0;
    let atrasos = 0;

    for (const row of detail.timeline) {
      if (row.merge_source === 'lifecycle') continue;
      const due = normalizeYmdInput(row.due_date);
      if (isRowPaid(row)) {
        const paid = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? due;
        if (paid?.startsWith(mk)) {
          receita += row.amount_cents ?? 0;
          pagamentos += 1;
        }
      } else if (due?.startsWith(mk) && isRowOverdue(row, today)) {
        atrasos += 1;
      }
    }

    months.push({
      monthKey: mk,
      name,
      receita: receita / 100,
      pagamentos,
      atrasos,
    });
  }

  return months;
}

function cyclesPerYear(interval: string): number {
  const map: Record<string, number> = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    semi_annual: 2,
    yearly: 1,
  };
  return map[interval] ?? 12;
}

export function buildSidebarHealthMetrics(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): SidebarHealthMetrics {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const health = computeHealthScore(detail, today);
  const summary = buildFinancialHistoryRows(detail);
  const lastPaid = summary.find((r) => r.visual === 'paid');
  const nextDue = normalizeYmdInput(detail.subscription.next_billing_date);
  const daysUntilCharge = nextDue ? daysBetweenYmd(today, nextDue) : null;
  const annual = detail.subscription.amount_cents * cyclesPerYear(detail.subscription.billing_interval);

  let financialHealthLabel = 'Saudável';
  if (health.state === 'attention') financialHealthLabel = 'Requer atenção';
  if (health.state === 'error') financialHealthLabel = 'Com pendências';
  if (health.state === 'paused') financialHealthLabel = 'Pausada';
  if (health.state === 'cancelled') financialHealthLabel = 'Encerrada';

  return {
    healthScore: health,
    lastPaymentLabel: lastPaid?.paidAt ? formatYmdBrSafe(lastPaid.paidAt) : '—',
    nextReceiptLabel: nextDue ? formatNextChargePremium(nextDue) : '—',
    daysUntilCharge: daysUntilCharge != null && daysUntilCharge >= 0 ? daysUntilCharge : null,
    annualProjectedCents: annual,
    financialHealthLabel,
  };
}

export function detectExperienceEmpty(
  section: 'history' | 'billing' | 'payment' | 'forecast' | 'calendar',
  detail: CrmSubscriptionDetailPayload
): ExperienceEmptyKind {
  const rows = detail.timeline.filter((r) => r.merge_source !== 'lifecycle');
  switch (section) {
    case 'history':
      return rows.length === 0 ? 'history' : null;
    case 'billing':
      return rows.every((r) => !r.invoice_id) ? 'billing' : null;
    case 'payment':
      return rows.every((r) => !isRowPaid(r)) ? 'payment' : null;
    case 'forecast':
      return detail.subscription.status === 'cancelled' || !detail.subscription.next_billing_date
        ? 'forecast'
        : null;
    case 'calendar':
      return buildCalendarMonths(detail, 1).every((m) => m.events.length === 0) ? 'calendar' : null;
    default:
      return null;
  }
}

export function calendarDayAriaLabel(cell: CalendarGridCell): string {
  if (!cell.ymd || cell.day == null) return 'Dia vazio';
  const evCount = cell.events.length;
  const kinds = cell.events.map((e) => e.label).join(', ');
  return evCount === 0
    ? `Dia ${cell.day}, sem eventos`
    : `Dia ${cell.day}, ${evCount} evento(s): ${kinds}`;
}

export function healthStateEmoji(state: HealthState): string {
  const map: Record<HealthState, string> = {
    healthy: '🟢',
    attention: '🟡',
    error: '🔴',
    paused: '⚪',
    cancelled: '⚫',
  };
  return map[state];
}

export function premiumHeaderStatusDot(status: string): string {
  if (status === 'cancelled') return '⚫';
  if (status === 'paused') return '⚪';
  return '🟢';
}

export function memoizeDetailKey(detail: CrmSubscriptionDetailPayload): string {
  return [
    detail.subscription.id,
    detail.subscription.updated_at,
    detail.subscription.next_billing_date,
    detail.subscription.status,
    detail.stats.charge_count,
    detail.timeline.length,
  ].join(':');
}

export function responsiveCalendarColumns(width: number): number {
  if (width < 640) return 7;
  if (width < 1024) return 7;
  return 7;
}

export function shouldLazyLoadChart(isMobile: boolean): boolean {
  return isMobile;
}

export function isValidHistorySort(value: string): value is HistorySort {
  return ['due_desc', 'due_asc', 'amount_desc', 'amount_asc'].includes(value);
}

export function isValidHistoryFilter(value: string): value is HistoryFilter {
  return ['all', 'paid', 'pending', 'overdue', 'cancelled'].includes(value);
}

export function defaultCalendarMonthKey(detail: CrmSubscriptionDetailPayload, todayYmd?: string): string {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const next = normalizeYmdInput(detail.subscription.next_billing_date);
  return (next ?? today).slice(0, 7);
}

export function compareKpiTrend(pct: number | null): string {
  if (pct == null) return '';
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return '→ 0%';
}

export function formatAmountPerInterval(cents: number, interval: string): string {
  const label = interval === 'weekly' ? 'semana' : interval === 'monthly' ? 'mês' : 'período';
  return `${formatCentsCompact(cents)} / ${label}`;
}

export function resolveGenerationForSidebar(detail: CrmSubscriptionDetailPayload): string | null {
  const due = normalizeYmdInput(detail.subscription.next_billing_date);
  if (!due) return null;
  return resolveGenerationYmd(due, detail.tenant_billing);
}

export function wcagContrastPair(state: HealthState): { fg: string; bg: string } {
  const pairs: Record<HealthState, { fg: string; bg: string }> = {
    healthy: { fg: 'text-emerald-800 dark:text-emerald-300', bg: 'bg-emerald-500/10' },
    attention: { fg: 'text-amber-800 dark:text-amber-300', bg: 'bg-amber-500/10' },
    error: { fg: 'text-red-800 dark:text-red-300', bg: 'bg-red-500/10' },
    paused: { fg: 'text-muted-foreground', bg: 'bg-muted/40' },
    cancelled: { fg: 'text-muted-foreground', bg: 'bg-muted/60' },
  };
  return pairs[state];
}

export function keyboardNavOrder(): string[] {
  return ['header', 'kpis', 'calendar', 'timeline', 'history', 'forecast', 'sidebar'];
}

export function focusRingClass(): string {
  return 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
}

export function skeletonSectionCount(): number {
  return 6;
}

export function chartHasData(months: RevenueChartMonth[]): boolean {
  return months.some((m) => m.receita > 0 || m.pagamentos > 0 || m.atrasos > 0);
}

export function groupTitleWhenSingular(title: string, count: number): string {
  if (count <= 1) return title;
  if (title.endsWith('confirmado')) return `${count} pagamentos confirmados`;
  if (title.endsWith('gerada')) return `${count} cobranças geradas`;
  return `${count} ${title.toLowerCase()}s`;
}

export function polishTransitionClass(): string {
  return 'transition-all duration-200 ease-out';
}

export function expandAnimationClass(open: boolean): string {
  return open ? 'animate-in fade-in-0 slide-in-from-top-1' : 'animate-out fade-out-0';
}

export function isYmdInMonth(ymd: string, monthKey: string): boolean {
  return isValidYmd(ymd) && ymd.startsWith(monthKey);
}
