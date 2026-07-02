import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  buildFinancialHistoryRows,
  buildFutureCycles,
  friendlyBillingMessage,
  normalizeYmdInput,
  resolveGenerationYmd,
  subscriptionHeadlineStatus,
  type FinancialHistoryRow,
} from './billingSubscriptionExperience';
import {
  buildCalendarGrid,
  defaultCalendarMonthKey,
  formatNextChargePremium,
  shiftMonthKey,
} from './billingSubscriptionExperiencePolish';
import { intervalLabel } from '@/components/subscriptions/subscriptionsListUtils';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { isRecoverableCycleFailure } from './subscriptionRenewalRecovery';

export type FinancialCalendarKind =
  | 'paid'
  | 'invoiced'
  | 'due'
  | 'overdue'
  | 'failed'
  | 'cancelled'
  | 'reprocessed';

export type FinancialKpiKey =
  | 'received'
  | 'open'
  | 'next_receipt'
  | 'forecast_12m'
  | 'last_payment'
  | 'status';

export type FinancialKpiCard = {
  key: FinancialKpiKey;
  label: string;
  primary: string;
  secondary: string | null;
  comparisonPct: number | null;
};

export type FinancialCalendarEvent = {
  id: string;
  ymd: string;
  kind: FinancialCalendarKind;
  emoji: string;
  title: string;
  amountCents: number | null;
  competence: string | null;
  invoiceId: string | null;
  statusPt: string | null;
  gateway: string | null;
  paidAt: string | null;
  clientName?: string | null;
  lastUpdatedAt?: string | null;
  cycleId?: string | null;
  notes?: string | null;
};

export type FinancialTimelineItem = {
  id: string;
  ymd: string;
  icon: string;
  title: string;
  amountCents: number | null;
  dateLabel: string;
  subtitle?: string | null;
  eventType?: import('./financialEventTypes').FinancialEventType;
  invoiceId?: string | null;
};

export type FinancialTimelineMonthGroup = {
  monthKey: string;
  monthLabel: string;
  summaryTitle: string;
  totalCents: number;
  count: number;
  items: FinancialTimelineItem[];
};

export type UpcomingReceipt = {
  id: string;
  ymd: string;
  dateLabel: string;
  amountCents: number;
  statusLabel: string;
};

export type FinancialAlertKind = 'billing_missing' | 'client_overdue' | 'gateway_failed';

export type FinancialAlert = {
  id: string;
  kind: FinancialAlertKind;
  emoji: string;
  title: string;
  message: string;
  actionLabel: string;
  /** Detalhe técnico opcional (ex.: erro de job) — link "Ver detalhes". */
  technicalDetail?: string | null;
};

export type FinancialProgressMonth = {
  monthKey: string;
  monthLabel: string;
  fillPct: number;
  statusLabel: string;
  sublabel: string | null;
};

export type FinancialInsight = {
  id: string;
  icon: string;
  text: string;
};

export type FinancialHeaderData = {
  clientName: string;
  planName: string;
  amountLabel: string;
  statusLabel: string;
  statusEmoji: string;
  lastPaymentLabel: string;
  lastPaymentAmount: string | null;
  nextReceiptLabel: string;
  nextReceiptAmount: string | null;
  annualForecastLabel: string;
  progressPct: number;
  progressLabel: string;
};

export type FinancialSidebarData = {
  nextReceiptDate: string;
  nextReceiptAmount: string;
  lastPaymentDate: string;
  lastPaymentAmount: string;
  openAmount: string;
  annualRevenue: string;
};

export type FinancialHistoryFilter =
  | 'all'
  | 'paid'
  | 'pending'
  | 'overdue'
  | 'cancelled'
  | 'refunded';

export type FinancialHistorySort = 'due_desc' | 'due_asc' | 'amount_desc' | 'amount_asc';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const FINANCIAL_CALENDAR_LEGEND: Array<{ kind: FinancialCalendarKind; emoji: string; label: string }> = [
  { kind: 'paid', emoji: '🟢', label: 'Pago' },
  { kind: 'failed', emoji: '🔴', label: 'Falhou' },
  { kind: 'invoiced', emoji: '🔵', label: 'Fatura emitida' },
  { kind: 'due', emoji: '🟠', label: 'Vencimento' },
  { kind: 'overdue', emoji: '🔴', label: 'Atrasada' },
  { kind: 'cancelled', emoji: '⚫', label: 'Cancelada' },
  { kind: 'reprocessed', emoji: '🔄', label: 'Reprocessada' },
];

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatCentsCompact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
  return formatCents(cents);
}

function formatDateShort(ymd: string | null | undefined): string {
  const d = normalizeYmdInput(ymd);
  if (!d) return '—';
  const day = Number(d.slice(8, 10));
  const mi = Number(d.slice(5, 7)) - 1;
  return mi >= 0 && mi < 12 ? `${day} ${MONTH_SHORT[mi]}` : formatYmdBrSafe(d);
}

function isPaid(row: CrmSubscriptionTimelineRow): boolean {
  return (row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid';
}

function isRefunded(row: CrmSubscriptionTimelineRow): boolean {
  const inv = (row.invoice_status ?? '').toLowerCase();
  return inv === 'refunded' || inv === 'chargeback';
}

function isOverdue(row: CrmSubscriptionTimelineRow, today: string): boolean {
  if (isPaid(row) || isRefunded(row)) return false;
  const due = normalizeYmdInput(row.due_date);
  return Boolean(due && due < today);
}

function cyclesPerYear(interval: string): number {
  const m: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, semi_annual: 2, yearly: 1 };
  return m[interval] ?? 12;
}

function annualForecastCents(detail: CrmSubscriptionDetailPayload): number {
  return detail.subscription.amount_cents * cyclesPerYear(detail.subscription.billing_interval);
}

function lastPaidRow(detail: CrmSubscriptionDetailPayload): CrmSubscriptionTimelineRow | null {
  let best: CrmSubscriptionTimelineRow | null = null;
  let bestYmd = '';
  for (const row of detail.timeline) {
    if (!isPaid(row)) continue;
    const ymd = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? normalizeYmdInput(row.due_date) ?? '';
    if (ymd > bestYmd) {
      bestYmd = ymd;
      best = row;
    }
  }
  return best;
}

export function calendarKindEmoji(kind: FinancialCalendarKind): string {
  return FINANCIAL_CALENDAR_LEGEND.find((l) => l.kind === kind)?.emoji ?? '○';
}

export function mapRowToFinancialCalendarKind(
  row: CrmSubscriptionTimelineRow,
  today: string
): FinancialCalendarKind {
  if (row.has_auto_retry) return 'reprocessed';
  if (isRefunded(row)) return 'cancelled';
  if (row.operational_state === 'cancelled' || row.operational_state === 'skipped') return 'cancelled';
  if (isPaid(row)) return 'paid';
  if (row.operational_state === 'failed') return 'failed';
  if (row.operational_state === 'gateway_failed') return 'failed';
  if (isOverdue(row, today)) return 'overdue';
  const due = normalizeYmdInput(row.due_date);
  if (due === today) return 'due';
  if (row.invoice_id || row.operational_state === 'generated') return 'invoiced';
  return 'due';
}

export function calendarEventTitle(kind: FinancialCalendarKind, today: string, dueYmd: string | null): string {
  if (kind === 'paid') return 'Pagamento recebido';
  if (kind === 'failed') return 'Falha na geração';
  if (kind === 'invoiced') return 'Fatura criada';
  if (kind === 'due' && dueYmd === today) return 'Vence hoje';
  if (kind === 'due') return 'Vencimento';
  if (kind === 'overdue') return 'Pagamento atrasado';
  if (kind === 'cancelled') return 'Cancelada';
  return 'Reprocessada';
}

export function buildFinancialCalendarEvents(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialCalendarEvent[] {
  return createFinancialEventStore(detail, todayYmd).getCalendarEvents();
}

export function financialEventsForMonth(events: FinancialCalendarEvent[], monthKey: string): FinancialCalendarEvent[] {
  return events.filter((e) => e.ymd.startsWith(monthKey));
}

export function buildFinancialHeaderData(detail: CrmSubscriptionDetailPayload, todayYmd?: string): FinancialHeaderData {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const head = subscriptionHeadlineStatus(detail);
  const last = lastPaidRow(detail);
  const nextDue = normalizeYmdInput(detail.subscription.next_billing_date);
  const annual = annualForecastCents(detail);
  const progress = computeSubscriptionProgress(detail);

  const statusEmoji =
    detail.subscription.status === 'cancelled'
      ? '⚫'
      : detail.subscription.status === 'paused'
        ? '⚪'
        : '🟢';

  return {
    clientName: detail.client_name?.trim() || 'Cliente',
    planName: detail.plan_label?.trim() || 'Assinatura recorrente',
    amountLabel: `${formatCentsCompact(detail.subscription.amount_cents)} / ${intervalLabel(detail.subscription.billing_interval).toLowerCase()}`,
    statusLabel: head.label,
    statusEmoji,
    lastPaymentLabel: last ? formatDateShort(normalizeYmdInput(last.processed_at?.slice(0, 10)) ?? last.due_date) : '—',
    lastPaymentAmount: last?.amount_cents != null ? formatCentsCompact(last.amount_cents) : null,
    nextReceiptLabel: nextDue ? formatDateShort(nextDue) : '—',
    nextReceiptAmount: nextDue ? formatCentsCompact(detail.subscription.amount_cents) : null,
    annualForecastLabel: formatCentsCompact(annual),
    progressPct: progress.pct,
    progressLabel: progress.label,
  };
}

export function computeSubscriptionProgress(detail: CrmSubscriptionDetailPayload): { pct: number; label: string } {
  const paid = detail.timeline.filter(isPaid).length;
  const total = detail.stats.charge_count;
  if (detail.subscription.cycles_unlimited === false && detail.subscription.max_cycles) {
    const max = detail.subscription.max_cycles;
    const pct = Math.min(100, Math.round((paid / max) * 100));
    return { pct, label: `${paid} de ${max} ciclos` };
  }
  if (total <= 0) return { pct: 0, label: 'Aguardando primeira cobrança' };
  const pct = Math.min(100, Math.round((paid / total) * 100));
  return { pct, label: `${paid} cobrança(s) recebida(s)` };
}

function paidAmountInMonth(detail: CrmSubscriptionDetailPayload, monthKey: string): number {
  return detail.timeline
    .filter((r) => {
      if (!isPaid(r)) return false;
      const paid = normalizeYmdInput(r.processed_at?.slice(0, 10)) ?? normalizeYmdInput(r.due_date);
      return paid?.startsWith(monthKey);
    })
    .reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
}

export function buildFinancialKpiCards(detail: CrmSubscriptionDetailPayload, todayYmd?: string): FinancialKpiCard[] {
  return createFinancialEventStore(detail, todayYmd).getKpiCards();
}

export function buildHumanizedTimeline(detail: CrmSubscriptionDetailPayload): FinancialTimelineItem[] {
  const items: FinancialTimelineItem[] = [];
  for (const row of detail.timeline) {
    if (row.merge_source === 'lifecycle') continue;
    if (isPaid(row)) {
      const ymd = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? normalizeYmdInput(row.due_date) ?? '';
      if (!ymd) continue;
      items.push({
        id: `pay-${row.invoice_id}`,
        ymd,
        icon: '💰',
        title: 'Cliente pagou',
        amountCents: row.amount_cents,
        dateLabel: formatDateShort(ymd),
      });
    } else if (row.invoice_id) {
      const ymd =
        normalizeYmdInput(row.invoice_created_at?.slice(0, 10)) ??
        normalizeYmdInput(row.due_date) ??
        '';
      if (!ymd) continue;
      items.push({
        id: `inv-${row.invoice_id}`,
        ymd,
        icon: '🧾',
        title: 'Fatura emitida',
        amountCents: row.amount_cents,
        dateLabel: formatDateShort(ymd),
      });
    }
  }
  return items.sort((a, b) => b.ymd.localeCompare(a.ymd));
}

export function groupFinancialTimelineByMonth(items: FinancialTimelineItem[]): FinancialTimelineMonthGroup[] {
  const paidByMonth = new Map<string, FinancialTimelineItem[]>();
  for (const item of items) {
    if (item.icon !== '💰') continue;
    const mk = item.ymd.slice(0, 7);
    const list = paidByMonth.get(mk) ?? [];
    list.push(item);
    paidByMonth.set(mk, list);
  }

  const groups: FinancialTimelineMonthGroup[] = [];
  for (const [monthKey, monthItems] of [...paidByMonth.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    const mi = Number(monthKey.slice(5, 7)) - 1;
    const total = monthItems.reduce((s, i) => s + (i.amountCents ?? 0), 0);
    groups.push({
      monthKey,
      monthLabel: mi >= 0 ? MONTH_NAMES[mi] : monthKey,
      summaryTitle: 'Recebeu',
      totalCents: total,
      count: monthItems.length,
      items: monthItems.sort((a, b) => b.ymd.localeCompare(a.ymd)),
    });
  }
  return groups;
}

export function buildUpcomingReceipts(detail: CrmSubscriptionDetailPayload, count = 8): UpcomingReceipt[] {
  return createFinancialEventStore(detail).getUpcomingReceipts().slice(0, count);
}

export function buildFinancialAlerts(detail: CrmSubscriptionDetailPayload, todayYmd?: string): FinancialAlert[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const alerts: FinancialAlert[] = [];

  const failedGen = detail.timeline.find(
    (r) =>
      r.operational_state === 'failed' &&
      !r.invoice_id &&
      !isRecoverableCycleFailure(r, today)
  );
  if (failedGen) {
    alerts.push({
      id: 'billing-missing',
      kind: 'billing_missing',
      emoji: '⚠',
      title: 'Cobrança não gerada',
      message: friendlyBillingMessage(failedGen.job_error_snippet) || 'Clique para gerar novamente.',
      actionLabel: 'Gerar novamente',
    });
  }

  const overdue = detail.timeline.filter((r) => isOverdue(r, today));
  if (overdue.length > 0) {
    const due = normalizeYmdInput(overdue[0].due_date)!;
    const days = Math.floor(
      (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${due}T12:00:00Z`).getTime()) / 86400000
    );
    alerts.push({
      id: 'client-overdue',
      kind: 'client_overdue',
      emoji: '⚠',
      title: 'Cliente atrasado',
      message: `${days} dia(s).`,
      actionLabel: 'Enviar lembrete',
    });
  }

  const gatewayFail = detail.timeline.find((r) => r.operational_state === 'gateway_failed');
  if (gatewayFail) {
    alerts.push({
      id: 'gateway-failed',
      kind: 'gateway_failed',
      emoji: '⚠',
      title: 'Gateway recusou cobrança',
      message: 'Verifique o meio de pagamento do cliente.',
      actionLabel: 'Ver detalhes',
    });
  }

  return alerts;
}

export function buildFinancialProgressMonths(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialProgressMonth[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const currentMk = today.slice(0, 7);
  const months: FinancialProgressMonth[] = [];

  for (let i = 0; i < 3; i += 1) {
    const mk = shiftMonthKey(currentMk, i);
    const mi = Number(mk.slice(5, 7)) - 1;
    const label = mi >= 0 ? MONTH_NAMES[mi] : mk;

    const rows = detail.timeline.filter((r) => {
      const due = normalizeYmdInput(r.due_date);
      return due?.startsWith(mk);
    });

    if (rows.length === 0 && i > 0) {
      months.push({
        monthKey: mk,
        monthLabel: label,
        fillPct: 0,
        statusLabel: 'Ainda não iniciado',
        sublabel: null,
      });
      continue;
    }

    const paid = rows.filter(isPaid);
    const pending = rows.filter((r) => r.invoice_id && !isPaid(r) && !isRefunded(r));
    const total = rows.length || 1;
    const fillPct = Math.round((paid.length / total) * 100);

    let statusLabel = 'Pago';
    let sublabel: string | null = null;
    if (paid.length === 0 && pending.length > 0) {
      statusLabel = 'Cobrança criada';
      sublabel = 'Aguardando pagamento';
    } else if (paid.length === 0 && rows.length === 0) {
      statusLabel = i === 0 ? 'Em andamento' : 'Ainda não iniciado';
    } else if (paid.length < total) {
      statusLabel = 'Parcial';
      sublabel = 'Aguardando pagamento';
    }

    months.push({ monthKey: mk, monthLabel: label, fillPct: rows.length === 0 && i === 0 ? 30 : fillPct, statusLabel, sublabel });
  }

  return months;
}

export function buildFinancialInsights(detail: CrmSubscriptionDetailPayload, todayYmd?: string): FinancialInsight[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const insights: FinancialInsight[] = [];
  const overdueEver = detail.timeline.some((r) => isOverdue(r, today) || (normalizeYmdInput(r.due_date)! < today && !isPaid(r)));

  if (!overdueEver && detail.timeline.some(isPaid)) {
    insights.push({ id: 'never-late', icon: '💡', text: 'Esta assinatura nunca atrasou pagamentos.' });
  }

  insights.push({
    id: 'forecast',
    icon: '💡',
    text: `Receita prevista (anual): ${formatCentsCompact(annualForecastCents(detail))}.`,
  });

  const paidRows = detail.timeline.filter(isPaid);
  const alwaysOnDay = paidRows.length > 0 && paidRows.every((r) => {
    const due = normalizeYmdInput(r.due_date);
    const paid = normalizeYmdInput(r.processed_at?.slice(0, 10)) ?? due;
    return due && paid && paid <= due;
  });
  if (alwaysOnDay) {
    insights.push({ id: 'on-time', icon: '💡', text: 'Cliente paga sempre no dia.' });
  }

  const firstPaid = paidRows
    .map((r) => normalizeYmdInput(r.processed_at?.slice(0, 10)) ?? normalizeYmdInput(r.due_date))
    .filter(Boolean)
    .sort()[0];
  if (firstPaid) {
    const months = Math.max(
      1,
      Math.round(
        (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${firstPaid}T12:00:00Z`).getTime()) /
          (86400000 * 30)
      )
    );
    insights.push({ id: 'recurring', icon: '💡', text: `Receita recorrente há ${months} mês(es).` });
  }

  return insights;
}

export function buildFinancialSidebarData(detail: CrmSubscriptionDetailPayload): FinancialSidebarData {
  const last = lastPaidRow(detail);
  const nextDue = normalizeYmdInput(detail.subscription.next_billing_date);
  return {
    nextReceiptDate: nextDue ? formatDateShort(nextDue) : '—',
    nextReceiptAmount: nextDue ? formatCentsCompact(detail.subscription.amount_cents) : '—',
    lastPaymentDate: last ? formatDateShort(normalizeYmdInput(last.processed_at?.slice(0, 10)) ?? last.due_date) : '—',
    lastPaymentAmount: last?.amount_cents != null ? formatCentsCompact(last.amount_cents) : '—',
    openAmount: formatCentsCompact(detail.stats.total_pending_cents),
    annualRevenue: formatCentsCompact(annualForecastCents(detail)),
  };
}

export function historyRowFinancialCategory(
  row: FinancialHistoryRow,
  today: string,
  timelineRow?: CrmSubscriptionTimelineRow
): FinancialHistoryFilter {
  if (timelineRow && isRefunded(timelineRow)) return 'refunded';
  if (row.visual === 'cancelled') return 'cancelled';
  if (row.visual === 'paid') return 'paid';
  if (row.visual === 'overdue') return 'overdue';
  const due = row.dueYmd;
  if (due && due < today) return 'overdue';
  return 'pending';
}

export function filterFinancialHistory(
  rows: FinancialHistoryRow[],
  detail: CrmSubscriptionDetailPayload,
  options: { filter: FinancialHistoryFilter; search: string; sort: FinancialHistorySort; todayYmd?: string }
): FinancialHistoryRow[] {
  const today = options.todayYmd ?? new Date().toISOString().slice(0, 10);
  const timelineById = new Map(
    detail.timeline.map((r, i) => [r.invoice_id ?? r.cycle_id ?? `row-${i}`, r])
  );
  const q = options.search.trim().toLowerCase();

  let result = rows.filter((row) => {
    const tRow = timelineById.get(row.id);
    const cat = historyRowFinancialCategory(row, today, tRow);
    if (options.filter !== 'all' && cat !== options.filter) return false;
    if (!q) return true;
    const hay = [row.competence, row.invoiceId, row.amountCents != null ? String(row.amountCents / 100) : '', row.statusPt]
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
      default:
        return (b.dueYmd ?? '').localeCompare(a.dueYmd ?? '');
    }
  });

  return result;
}

export function mobileFinancialSectionOrder(): string[] {
  return [
    'header',
    'kpis',
    'calendar',
    'sidebar',
    'history',
    'insights',
    'settings',
    'technical',
  ];
}

export function financialCalendarGrid(
  detail: CrmSubscriptionDetailPayload,
  monthKey: string,
  todayYmd?: string
) {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const events = buildFinancialCalendarEvents(detail, today);
  const monthEvents = financialEventsForMonth(events, monthKey);
  const legacy = monthEvents.map((e) => ({
    id: e.id,
    ymd: e.ymd,
    monthKey: e.ymd.slice(0, 7),
    day: Number(e.ymd.slice(8, 10)),
    kind: 'due' as const,
    visual: 'future' as const,
    label: e.title,
    competence: e.competence,
    invoiceId: e.invoiceId,
    amountCents: e.amountCents,
    dueYmd: e.ymd,
    statusPt: e.statusPt,
    gateway: e.gateway,
    cycleLabel: e.competence,
  }));
  return buildCalendarGrid(monthKey, legacy, today);
}

export function defaultFinancialCalendarMonth(detail: CrmSubscriptionDetailPayload, todayYmd?: string): string {
  return defaultCalendarMonthKey(detail, todayYmd);
}

export function financialDayAriaLabel(day: number, events: FinancialCalendarEvent[]): string {
  if (events.length === 0) return `Dia ${day}, sem movimentação`;
  return `Dia ${day}, ${events.map((e) => e.title).join(', ')}`;
}

export function isValidFinancialHistoryFilter(v: string): v is FinancialHistoryFilter {
  return ['all', 'paid', 'pending', 'overdue', 'cancelled', 'refunded'].includes(v);
}

export function progressBarBlocks(fillPct: number): string {
  const filled = Math.round(fillPct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export { buildCalendarGrid, shiftMonthKey };
