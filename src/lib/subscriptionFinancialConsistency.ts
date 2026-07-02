import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import {
  buildFinancialHistoryRows,
  buildFutureCycles,
  friendlyBillingMessage,
  normalizeYmdInput,
} from './billingSubscriptionExperience';
import { resolveGenerationYmd } from './billingSubscriptionExperience';
import type {
  FinancialCalendarEvent,
  FinancialCalendarKind,
  FinancialKpiCard,
  FinancialTimelineItem,
  UpcomingReceipt,
} from './subscriptionFinancialExperience';
import { isDefinitiveCycleFailure, isRecoverableCycleFailure } from './subscriptionRenewalRecovery';
import {
  buildFinancialCalendarEvents,
  buildFinancialKpiCards,
  buildHumanizedTimeline,
  shiftMonthKey,
} from './subscriptionFinancialExperience';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Prioridade visual no mesmo dia: pagamento > falha > vencimento > emissão > previsto */
const CALENDAR_KIND_PRIORITY: Record<FinancialCalendarKind, number> = {
  paid: 1,
  failed: 2,
  overdue: 3,
  due: 4,
  reprocessed: 5,
  invoiced: 6,
  cancelled: 7,
};

export type FinancialMonthOverview = {
  monthKey: string;
  monthLabel: string;
  statusIcon: '✔' | '⚠' | '○';
  statusLabel: string;
  detailLabel: string | null;
};

export type EnrichedUpcomingReceipt = UpcomingReceipt & {
  invoiceId: string | null;
  failed: boolean;
  canGenerate: boolean;
};

export function calendarEventPriority(kind: FinancialCalendarKind): number {
  return CALENDAR_KIND_PRIORITY[kind] ?? 99;
}

export function sortCalendarEventsByPriority(events: FinancialCalendarEvent[]): FinancialCalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      calendarEventPriority(a.kind) - calendarEventPriority(b.kind) ||
      a.ymd.localeCompare(b.ymd) ||
      a.id.localeCompare(b.id)
  );
}

export function pickPrimaryCalendarEvent(events: FinancialCalendarEvent[]): FinancialCalendarEvent | undefined {
  return sortCalendarEventsByPriority(events)[0];
}

export function groupCalendarEventsByDay(
  events: FinancialCalendarEvent[]
): Map<string, FinancialCalendarEvent[]> {
  const map = new Map<string, FinancialCalendarEvent[]>();
  for (const ev of events) {
    const list = map.get(ev.ymd) ?? [];
    list.push(ev);
    map.set(ev.ymd, list);
  }
  for (const [ymd, list] of map) {
    map.set(ymd, sortCalendarEventsByPriority(list));
  }
  return map;
}

function isPaid(row: CrmSubscriptionTimelineRow): boolean {
  return (row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid';
}

function isRefunded(row: CrmSubscriptionTimelineRow): boolean {
  const inv = (row.invoice_status ?? '').toLowerCase();
  return inv === 'refunded' || inv === 'chargeback';
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function buildFinancialMonthOverview(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialMonthOverview[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const currentMk = today.slice(0, 7);
  const months: FinancialMonthOverview[] = [];

  for (let i = 0; i < 3; i += 1) {
    const mk = shiftMonthKey(currentMk, i);
    const mi = Number(mk.slice(5, 7)) - 1;
    const label = mi >= 0 ? MONTH_NAMES[mi] : mk;

    const rows = detail.timeline.filter((r) => {
      if (r.merge_source === 'lifecycle') return false;
      const due = normalizeYmdInput(r.due_date);
      return due?.startsWith(mk);
    });

    if (rows.length === 0) {
      months.push({
        monthKey: mk,
        monthLabel: label,
        statusIcon: '○',
        statusLabel: 'Ainda não iniciado',
        detailLabel: null,
      });
      continue;
    }

    const paid = rows.filter(isPaid);
    const pending = rows.filter((r) => r.invoice_id && !isPaid(r) && !isRefunded(r));
    const failed = rows.filter(
      (r) => r.operational_state === 'failed' || r.operational_state === 'gateway_failed'
    );
    const paidTotal = paid.reduce((s, r) => s + (r.amount_cents ?? 0), 0);

    if (paid.length === rows.length) {
      months.push({
        monthKey: mk,
        monthLabel: label,
        statusIcon: '✔',
        statusLabel: 'Pago',
        detailLabel: paidTotal > 0 ? `Recebido ${formatCents(paidTotal)}` : null,
      });
    } else if (failed.length > 0 || pending.length > 0) {
      const pendingCount = pending.length + failed.filter((r) => !r.invoice_id).length;
      months.push({
        monthKey: mk,
        monthLabel: label,
        statusIcon: '⚠',
        statusLabel: 'Parcial',
        detailLabel:
          pendingCount > 0
            ? `${pendingCount} cobrança${pendingCount === 1 ? '' : 's'} pendente${pendingCount === 1 ? '' : 's'}`
            : failed.length > 0
              ? 'Falha na cobrança'
              : null,
      });
    } else if (paid.length > 0) {
      months.push({
        monthKey: mk,
        monthLabel: label,
        statusIcon: '⚠',
        statusLabel: 'Parcial',
        detailLabel: `Recebido ${formatCents(paidTotal)}`,
      });
    } else {
      months.push({
        monthKey: mk,
        monthLabel: label,
        statusIcon: '○',
        statusLabel: 'Em andamento',
        detailLabel: null,
      });
    }
  }

  return months;
}

function timelineRowForDue(detail: CrmSubscriptionDetailPayload, ymd: string): CrmSubscriptionTimelineRow | null {
  return (
    detail.timeline.find(
      (r) => r.merge_source !== 'lifecycle' && normalizeYmdInput(r.due_date) === ymd
    ) ?? null
  );
}

function formatDueLabel(ymd: string): string {
  const day = Number(ymd.slice(8, 10));
  const mi = Number(ymd.slice(5, 7)) - 1;
  const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return mi >= 0 && mi < 12 ? `${day} ${MONTH_SHORT[mi]}` : ymd;
}

export function enrichUpcomingReceipts(
  detail: CrmSubscriptionDetailPayload,
  receipts: UpcomingReceipt[]
): EnrichedUpcomingReceipt[] {
  const today = new Date().toISOString().slice(0, 10);
  const byYmd = new Map<string, EnrichedUpcomingReceipt>();

  for (const row of detail.timeline) {
    if (row.merge_source === 'lifecycle') continue;
    const ymd = normalizeYmdInput(row.due_date);
    if (!ymd) continue;
    const definitiveFailed =
      isDefinitiveCycleFailure(row, today) || row.operational_state === 'gateway_failed';
    const recoverableFailed = isRecoverableCycleFailure(row, today);
    const paid =
      (row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid';
    if (paid) continue;
    if (!definitiveFailed && !recoverableFailed && ymd < today) continue;

    byYmd.set(ymd, {
      id: `tl-${row.cycle_id ?? ymd}`,
      ymd,
      dateLabel: formatDueLabel(ymd),
      amountCents: row.amount_cents ?? detail.subscription.amount_cents,
      statusLabel: definitiveFailed ? 'Falhou' : recoverableFailed ? 'Pendente' : row.status_pt || 'Previsto',
      invoiceId: row.invoice_id,
      failed: definitiveFailed,
      canGenerate: !row.invoice_id && (recoverableFailed || definitiveFailed || row.operational_state === 'awaiting_generation'),
    });
  }

  for (const r of receipts) {
    if (byYmd.has(r.ymd)) continue;
    const row = timelineRowForDue(detail, r.ymd);
    const definitiveFailed =
      Boolean(row && isDefinitiveCycleFailure(row, today)) ||
      row?.operational_state === 'gateway_failed';
    const recoverableFailed = Boolean(row && isRecoverableCycleFailure(row, today));
    const invoiceId = row?.invoice_id ?? null;
    byYmd.set(r.ymd, {
      ...r,
      invoiceId,
      failed: definitiveFailed,
      canGenerate:
        !invoiceId &&
        (recoverableFailed || definitiveFailed || row?.operational_state === 'awaiting_generation'),
      statusLabel: definitiveFailed
        ? 'Falhou'
        : recoverableFailed
          ? 'Pendente'
          : invoiceId
            ? row?.status_pt || 'Emitida'
            : r.statusLabel,
    });
  }

  return [...byYmd.values()].sort((a, b) => a.ymd.localeCompare(b.ymd));
}

export function buildEnrichedHumanizedTimeline(detail: CrmSubscriptionDetailPayload): FinancialTimelineItem[] {
  const items: FinancialTimelineItem[] = [];

  for (const row of detail.timeline) {
    if (row.merge_source === 'lifecycle') continue;
    const due = normalizeYmdInput(row.due_date);

    if (isPaid(row)) {
      const ymd = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? due ?? '';
      if (!ymd) continue;
      items.push({
        id: `pay-${row.invoice_id ?? row.cycle_id}`,
        ymd,
        icon: '💰',
        title: 'Recebeu',
        amountCents: row.amount_cents,
        dateLabel: ymd,
        subtitle: null,
      });
    } else if (row.operational_state === 'failed' || row.operational_state === 'gateway_failed') {
      const ymd = due ?? normalizeYmdInput(resolveGenerationYmd(due, detail.tenant_billing)) ?? '';
      if (!ymd) continue;
      items.push({
        id: `fail-${row.cycle_id ?? row.due_date}`,
        ymd,
        icon: '⚠',
        title: 'Falha',
        amountCents: row.amount_cents,
        dateLabel: ymd,
        subtitle: friendlyBillingMessage(row.job_error_snippet) || 'Gateway recusou.',
      });
    } else if (row.invoice_id) {
      const ymd =
        normalizeYmdInput(row.invoice_created_at?.slice(0, 10)) ?? due ?? '';
      if (!ymd) continue;
      items.push({
        id: `inv-${row.invoice_id}`,
        ymd,
        icon: '🧾',
        title: 'Cobrança criada',
        amountCents: row.amount_cents,
        dateLabel: ymd,
        subtitle: row.status_pt || null,
      });
    } else if (row.has_auto_retry) {
      const ymd = due ?? '';
      if (!ymd) continue;
      items.push({
        id: `retry-${row.cycle_id}`,
        ymd,
        icon: '🔄',
        title: 'Reprocessada',
        amountCents: row.amount_cents,
        dateLabel: ymd,
        subtitle: null,
      });
    } else if (row.operational_state === 'cancelled' || row.operational_state === 'skipped') {
      const ymd = due ?? '';
      if (!ymd) continue;
      items.push({
        id: `cancel-${row.cycle_id}`,
        ymd,
        icon: '⚫',
        title: 'Cancelada',
        amountCents: row.amount_cents,
        dateLabel: ymd,
        subtitle: null,
      });
    }
  }

  return items.sort((a, b) => b.ymd.localeCompare(a.ymd));
}

export function groupEnrichedTimelineByMonth(
  items: FinancialTimelineItem[]
): Array<{
  monthKey: string;
  monthLabel: string;
  summaryTitle: string;
  totalCents: number;
  count: number;
  items: FinancialTimelineItem[];
}> {
  const byMonth = new Map<string, FinancialTimelineItem[]>();
  for (const item of items) {
    const mk = item.ymd.slice(0, 7);
    const list = byMonth.get(mk) ?? [];
    list.push(item);
    byMonth.set(mk, list);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthItems]) => {
      const mi = Number(monthKey.slice(5, 7)) - 1;
      const paidItems = monthItems.filter((i) => i.icon === '💰');
      const total = paidItems.reduce((s, i) => s + (i.amountCents ?? 0), 0);
      return {
        monthKey,
        monthLabel: mi >= 0 ? MONTH_NAMES[mi] : monthKey,
        summaryTitle: paidItems.length > 0 ? 'Recebeu' : 'Movimentação',
        totalCents: total,
        count: monthItems.length,
        items: monthItems.sort((a, b) => b.ymd.localeCompare(a.ymd)),
      };
    });
}

export function calendarEventsMatchHistory(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): { calendarCount: number; historyCount: number; missingFromCalendar: string[] } {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const events = buildFinancialCalendarEvents(detail, today);
  const history = buildFinancialHistoryRows(detail);
  const historyIds = new Set(
    history.map((h) => h.invoiceId ?? h.id).filter(Boolean) as string[]
  );
  const eventInvoiceIds = new Set(
    events.map((e) => e.invoiceId).filter(Boolean) as string[]
  );
  const missingFromCalendar = [...historyIds].filter((id) => !eventInvoiceIds.has(id));
  return {
    calendarCount: events.length,
    historyCount: history.length,
    missingFromCalendar,
  };
}

export function kpiReceivedMatchesHistory(detail: CrmSubscriptionDetailPayload, todayYmd?: string): boolean {
  const kpis = buildFinancialKpiCards(detail, todayYmd);
  const received = kpis.find((k) => k.key === 'received');
  if (!received) return true;
  const history = buildFinancialHistoryRows(detail).filter((r) => r.visual === 'paid');
  const total = history.reduce((s, r) => s + (r.amountCents ?? 0), 0);
  if (total === 0) return received.primary === 'R$ 0,00' || received.primary === '—';
  return received.primary.includes(String(Math.round(total / 100)));
}

export function historyRowAmountMatchesCalendar(
  row: FinancialHistoryRow,
  events: FinancialCalendarEvent[]
): boolean {
  if (row.amountCents == null) return true;
  const related = events.filter(
    (e) => e.invoiceId === row.invoiceId || e.competence === row.competence
  );
  if (related.length === 0) return true;
  return related.every((e) => e.amountCents === row.amountCents);
}

export function lazySectionDefaultVisible(sectionId: string): boolean {
  return sectionId === 'financial-header' || sectionId === 'financial-kpis';
}

export function shouldDeferFinancialSection(sectionId: string): boolean {
  return !lazySectionDefaultVisible(sectionId);
}

export type KpiNavigationTarget =
  | { type: 'history'; filter: 'paid' | 'pending' | 'all' }
  | { type: 'scroll'; targetId: string }
  | { type: 'open_invoice'; invoiceId: string }
  | { type: 'none' };

export function resolveKpiNavigation(
  key: FinancialKpiCard['key'],
  latestPaidInvoiceId: string | null | undefined,
  nextReceiptYmd: string | null | undefined
): KpiNavigationTarget {
  switch (key) {
    case 'received':
      return { type: 'history', filter: 'paid' };
    case 'open':
      return { type: 'history', filter: 'pending' };
    case 'last_payment':
      return latestPaidInvoiceId
        ? { type: 'open_invoice', invoiceId: latestPaidInvoiceId }
        : { type: 'history', filter: 'paid' };
    case 'next_receipt':
      return nextReceiptYmd
        ? { type: 'scroll', targetId: 'financial-history' }
        : { type: 'scroll', targetId: 'financial-calendar' };
    case 'status':
      return { type: 'scroll', targetId: 'financial-calendar' };
    default:
      return { type: 'none' };
  }
}

export function isKpiNavigable(key: FinancialKpiCard['key']): boolean {
  return ['received', 'open', 'last_payment', 'next_receipt', 'status'].includes(key);
}

/** Eventos de calendário que deveriam existir para cada linha do histórico */
export function expectedCalendarKindsForHistoryRow(
  row: FinancialHistoryRow,
  today: string
): FinancialCalendarKind[] {
  const kinds: FinancialCalendarKind[] = [];
  if (row.visual === 'paid') kinds.push('paid');
  if (row.visual === 'overdue') kinds.push('overdue');
  if (row.visual === 'cancelled') kinds.push('cancelled');
  if (row.visual === 'generated' || row.visual === 'future') {
    if (row.dueYmd && row.dueYmd < today && row.visual !== 'paid') kinds.push('overdue');
    else kinds.push('invoiced');
  }
  if (!row.invoiceId && row.visual === 'overdue') kinds.push('failed');
  return kinds;
}

export function humanizedTimelineCoversHistory(
  detail: CrmSubscriptionDetailPayload
): boolean {
  const history = buildFinancialHistoryRows(detail);
  const timeline = buildEnrichedHumanizedTimeline(detail);
  const historyWithInvoice = history.filter((h) => h.invoiceId);
  if (historyWithInvoice.length === 0) return true;
  const timelineInvoiceIds = new Set(
    timeline
      .map((t) => t.id.replace(/^inv-/, '').replace(/^pay-/, ''))
      .filter(Boolean)
  );
  return historyWithInvoice.every(
    (h) => h.invoiceId && (timelineInvoiceIds.has(h.invoiceId) || timeline.some((t) => t.id.includes(h.invoiceId!)))
  );
}

export function compareTimelineSources(detail: CrmSubscriptionDetailPayload): {
  legacyCount: number;
  enrichedCount: number;
} {
  return {
    legacyCount: buildHumanizedTimeline(detail).length,
    enrichedCount: buildEnrichedHumanizedTimeline(detail).length,
  };
}
