import { formatYmdBrSafe, isValidYmd, safeParseYmd } from '@/lib/billingSafeDate';
import {
  effectiveDaysBeforeFromTenantBilling,
  computeRecurringGenerationDateYmd,
} from '@/lib/recurringGenerationPreview';
import { isRecoverableCycleFailure, mapHistoryFinancialStatus, historyFinancialStatusLabel } from './subscriptionRenewalRecovery';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionJobRow,
  CrmSubscriptionTimelineRow,
  SubscriptionTimelineOperationalState,
} from '@/services/crmSubscriptions';
import { intervalLabel } from '@/components/subscriptions/subscriptionsListUtils';

/** Mensagens amigáveis para códigos técnicos (sem alterar motor). */
export const FRIENDLY_BILLING_ERROR_MESSAGES: Record<string, string> = {
  BILLING_PLAN_NOT_FOUND: 'A assinatura ainda está preparando sua estrutura de cobrança.',
  BILLING_PLAN_INVALID: 'Não foi possível preparar esta cobrança automaticamente.',
  BILLING_PLAN_PROVISION_FAILED: 'Não foi possível preparar esta cobrança automaticamente.',
  customer_unresolvable: 'Cliente não vinculado ou não encontrado no cadastro.',
  invoice_template_missing: 'Ainda não há uma fatura anterior para usar como modelo.',
  no_prior_invoice: 'É necessário pelo menos uma fatura paga antes desta ação.',
  missing_current_period_start: 'Datas do período ainda não foram definidas.',
  subscription_not_found: 'Assinatura não encontrada.',
  generation_failed: 'Houve um problema ao gerar esta cobrança.',
  gateway_failed: 'Houve um problema ao enviar a cobrança ao gateway.',
};

export type BillingVisualState =
  | 'preparing'
  | 'generating'
  | 'sending_gateway'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'error'
  | 'cancelled'
  | 'paused'
  | 'scheduled';

export type CalendarVisualKind = 'paid' | 'generated' | 'future' | 'overdue' | 'cancelled' | 'reprocessed';

export type CalendarEventKind = 'generation' | 'due' | 'paid' | 'lifecycle';

export type CalendarEvent = {
  id: string;
  ymd: string;
  monthKey: string;
  day: number;
  kind: CalendarEventKind;
  visual: CalendarVisualKind;
  label: string;
  competence: string | null;
  invoiceId: string | null;
  amountCents: number | null;
  dueYmd: string | null;
  statusPt: string | null;
  gateway: string | null;
  cycleLabel: string | null;
};

export type CalendarMonthGroup = {
  monthKey: string;
  monthLabelPt: string;
  events: CalendarEvent[];
};

export type BusinessTimelineEvent = {
  id: string;
  ymd: string;
  title: string;
  detail?: string | null;
  kind: 'subscription' | 'billing' | 'payment' | 'lifecycle' | 'contract' | 'scheduled';
};

export type FinancialHistoryRow = {
  id: string;
  competence: string;
  amountCents: number | null;
  dueYmd: string | null;
  paidAt: string | null;
  statusPt: string;
  gateway: string | null;
  invoiceId: string | null;
  visual: CalendarVisualKind;
  notes?: string | null;
  jobId?: string | null;
  /** Sprint 4.2D — ciclo canônico para geração determinística */
  cycleId?: string | null;
  /** Sprint 4.1L — destaque da próxima cobrança na coleção unificada */
  isNextCharge?: boolean;
  canGenerateNow?: boolean;
  /** Sprint 4.2H — competência projetada (sem cycle_id, sem ações). */
  isProjected?: boolean;
  eventType?: import('./financialEventTypes').FinancialEventType;
  /** Sprint 5.0-23C — ações derivadas exclusivamente do OCRE */
  canOpenNow?: boolean;
  canReprocessNow?: boolean;
  /** Sprint 5.0-24D — INV-19 violado; exibir alerta + Corrigir. */
  needsInvariantRepair?: boolean;
};

export type FinancialSummary = {
  projectedRevenueCents: number;
  receivedRevenueCents: number;
  openAmountCents: number;
  invoiceCount: number;
  averageTicketCents: number | null;
  lastPaymentYmd: string | null;
  maxOverdueDays: number | null;
};

export type SummaryCard = {
  key: string;
  label: string;
  value: string;
};

export type SubscriptionSituation = {
  label: string;
  visualState: BillingVisualState;
  friendlyMessage: string | null;
  hasError: boolean;
  technicalError: string | null;
};

export type FutureCycleRow = {
  index: number;
  competence: string;
  generationYmd: string | null;
  dueYmd: string;
  projectedAmountCents: number;
  projectedStatusPt: string;
};

export type TechnicalDiagnostics = {
  workerStatus: string | null;
  retryAt: string | null;
  cycleKey: string | null;
  jobId: string | null;
  engineVersion: string | null;
  executionTime: string | null;
  stacktrace: string | null;
  workerVersion?: string | null;
  executionVersion?: string | null;
  runtimeVersion?: string | null;
  pipeline?: string | null;
  currentStage?: string | null;
  requestId?: string | null;
  retryCount?: number | null;
  workerAttempt?: number | null;
  caller?: string | null;
  billingPlanId?: string | null;
  billingPlanItemCount?: number | null;
  currentCycleYmd?: string | null;
  nextCycleYmd?: string | null;
  currentInvoiceId?: string | null;
  normalizedDates?: Record<string, string | null>;
  lastGenerationAt?: string | null;
  lastRetryAt?: string | null;
  lastError?: string | null;
  lastErrorOrigin?: { file: string | null; function: string | null; stackSummary: string | null } | null;
};

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function friendlyBillingMessage(code: string | null | undefined): string {
  if (!code?.trim()) return 'Ocorreu um problema inesperado. Tente novamente ou contacte o suporte.';
  const trimmed = code.trim();
  if (FRIENDLY_BILLING_ERROR_MESSAGES[trimmed]) return FRIENDLY_BILLING_ERROR_MESSAGES[trimmed];
  if (trimmed.startsWith('status_')) {
    const st = trimmed.replace('status_', '');
    if (st === 'paused') return 'A assinatura está pausada.';
    if (st === 'cancelled') return 'A assinatura está cancelada.';
    return `Assinatura em estado: ${st}`;
  }
  if (trimmed.startsWith('enqueue_')) return 'A cobrança está na fila de processamento.';
  return trimmed.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeYmdInput(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (isValidYmd(s)) return s;
  const parsed = safeParseYmd(s.slice(0, 10));
  return parsed;
}

export function ymdToMonthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

export function monthKeyToLabelPt(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const mi = Number(m) - 1;
  if (!Number.isFinite(mi) || mi < 0 || mi > 11) return monthKey;
  return `${MONTH_NAMES_PT[mi]} ${y}`;
}

export function subscriptionHeadlineStatus(d: CrmSubscriptionDetailPayload): {
  label: string;
  variant: 'default' | 'secondary' | 'outline';
} {
  const s = d.subscription;
  if (s.status === 'completed') return { label: 'Finalizada', variant: 'secondary' };
  if (s.status === 'cancelled') return { label: 'Cancelada', variant: 'secondary' };
  if (s.status === 'paused') return { label: 'Pausada', variant: 'outline' };
  if (s.status !== 'active') return { label: s.status, variant: 'outline' };
  if (s.cancel_at_period_end) return { label: 'Encerra ao fim do período', variant: 'outline' };
  return { label: 'Ativa', variant: 'default' };
}

export function resolveGenerationYmd(
  dueYmd: string | null | undefined,
  tenantBilling: CrmSubscriptionDetailPayload['tenant_billing'],
  billingInterval?: string | null
): string | null {
  const due = normalizeYmdInput(dueYmd);
  if (!due) return null;
  const days = effectiveDaysBeforeFromTenantBilling(tenantBilling, billingInterval);
  return computeRecurringGenerationDateYmd(due, days);
}

export function mapOperationalStateToVisual(
  state: SubscriptionTimelineOperationalState | null | undefined,
  row?: Pick<
    CrmSubscriptionTimelineRow,
    'invoice_status' | 'has_auto_retry' | 'due_date' | 'cycle_date' | 'invoice_id' | 'cycle_status' | 'operational_state'
  >,
  todayYmd?: string
): CalendarVisualKind {
  if (row?.has_auto_retry) return 'reprocessed';
  const inv = (row?.invoice_status ?? '').toLowerCase();
  if (inv === 'paid' || state === 'paid') return 'paid';
  if (state === 'cancelled' || state === 'skipped') return 'cancelled';
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  if (row && state === 'failed' && isRecoverableCycleFailure(row, today)) return 'future';
  if (state === 'failed' || state === 'gateway_failed') return 'overdue';
  if (state === 'generated' || state === 'manual_invoice') return 'generated';
  if (
    state === 'scheduled' ||
    state === 'awaiting_generation' ||
    state === 'in_queue' ||
    state === 'processing'
  ) {
    return 'future';
  }
  if (row?.due_date && isPastDue(row.due_date) && inv !== 'paid') return 'overdue';
  return 'future';
}

function isPastDue(dueYmd: string | null | undefined): boolean {
  const ymd = normalizeYmdInput(dueYmd);
  if (!ymd) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ymd < today;
}

function calendarEventLabel(kind: CalendarEventKind, visual: CalendarVisualKind): string {
  if (kind === 'generation') return visual === 'paid' ? 'Fatura gerada' : 'Geração';
  if (kind === 'due') return visual === 'paid' ? 'Pago' : 'Vencimento';
  if (kind === 'paid') return 'Pago';
  return 'Evento';
}

export function buildCalendarEventFromTimelineRow(
  row: CrmSubscriptionTimelineRow,
  tenantBilling: CrmSubscriptionDetailPayload['tenant_billing'],
  index: number,
  billingInterval?: string | null
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const visual = mapOperationalStateToVisual(row.operational_state, row);
  const due = normalizeYmdInput(row.due_date);
  const gen = due ? resolveGenerationYmd(due, tenantBilling, billingInterval) : null;
  const competence = row.month_ref || row.cycle_label || null;
  const base = {
    competence,
    invoiceId: row.invoice_id,
    amountCents: row.amount_cents,
    dueYmd: due,
    statusPt: row.status_pt || row.operational_state_pt,
    gateway: row.gateway_status ?? row.gateway_reference_id,
    cycleLabel: row.cycle_label,
  };

  if (gen) {
    events.push({
      id: `gen-${index}-${gen}`,
      ymd: gen,
      monthKey: ymdToMonthKey(gen),
      day: Number(gen.slice(8, 10)),
      kind: 'generation',
      visual: visual === 'paid' ? 'generated' : visual,
      label: calendarEventLabel('generation', visual),
      ...base,
    });
  }
  if (due) {
    events.push({
      id: `due-${index}-${due}`,
      ymd: due,
      monthKey: ymdToMonthKey(due),
      day: Number(due.slice(8, 10)),
      kind: 'due',
      visual,
      label: calendarEventLabel('due', visual),
      ...base,
    });
  }
  if (visual === 'paid' && due) {
    events.push({
      id: `paid-${index}-${due}`,
      ymd: due,
      monthKey: ymdToMonthKey(due),
      day: Number(due.slice(8, 10)),
      kind: 'paid',
      visual: 'paid',
      label: 'Pago',
      ...base,
    });
  }
  return events;
}

export function buildCalendarMonths(
  detail: CrmSubscriptionDetailPayload,
  futureMonths = 3
): CalendarMonthGroup[] {
  const timeline = detail.timeline.filter((r) => r.merge_source !== 'lifecycle');
  const eventMap = new Map<string, CalendarEvent>();

  timeline.forEach((row, idx) => {
    for (const ev of buildCalendarEventFromTimelineRow(
      row,
      detail.tenant_billing,
      idx,
      detail.subscription.billing_interval
    )) {
      eventMap.set(ev.id, ev);
    }
  });

  const future = buildFutureCycles(detail, futureMonths);
  future.forEach((cycle) => {
    const gen = cycle.generationYmd;
    const due = cycle.dueYmd;
    const base = {
      competence: cycle.competence,
      invoiceId: null,
      amountCents: cycle.projectedAmountCents,
      dueYmd: due,
      statusPt: cycle.projectedStatusPt,
      gateway: null,
      cycleLabel: cycle.competence,
    };
    if (gen) {
      eventMap.set(`future-gen-${cycle.index}`, {
        id: `future-gen-${cycle.index}`,
        ymd: gen,
        monthKey: ymdToMonthKey(gen),
        day: Number(gen.slice(8, 10)),
        kind: 'generation',
        visual: 'future',
        label: 'Geração',
        ...base,
      });
    }
    eventMap.set(`future-due-${cycle.index}`, {
      id: `future-due-${cycle.index}`,
      ymd: due,
      monthKey: ymdToMonthKey(due),
      day: Number(due.slice(8, 10)),
      kind: 'due',
      visual: 'future',
      label: 'Vencimento',
      ...base,
    });
  });

  const byMonth = new Map<string, CalendarEvent[]>();
  for (const ev of eventMap.values()) {
    const list = byMonth.get(ev.monthKey) ?? [];
    list.push(ev);
    byMonth.set(ev.monthKey, list);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, events]) => ({
      monthKey,
      monthLabelPt: monthKeyToLabelPt(monthKey),
      events: events.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.kind.localeCompare(b.kind)),
    }));
}

export function calendarLegend(): Array<{ visual: CalendarVisualKind; symbol: string; label: string }> {
  return [
    { visual: 'paid', symbol: '✔', label: 'Pago' },
    { visual: 'generated', symbol: '●', label: 'Gerado' },
    { visual: 'future', symbol: '○', label: 'Futuro' },
    { visual: 'overdue', symbol: '⚠', label: 'Atrasado' },
    { visual: 'cancelled', symbol: '✖', label: 'Cancelado' },
    { visual: 'reprocessed', symbol: '↻', label: 'Reprocessado' },
  ];
}

export function buildBusinessTimelineEvents(detail: CrmSubscriptionDetailPayload): BusinessTimelineEvent[] {
  const events: BusinessTimelineEvent[] = [];
  const created = normalizeYmdInput(detail.subscription.created_at);
  if (created) {
    events.push({
      id: 'created',
      ymd: created,
      title: 'Assinatura criada',
      kind: 'subscription',
    });
  }

  if (detail.pending_contract) {
    const ymd = normalizeYmdInput(detail.subscription.next_billing_date) ?? created ?? '';
    events.push({
      id: 'pending-contract',
      ymd,
      title: 'Alteração de plano agendada',
      detail: 'A mudança será aplicada no próximo ciclo.',
      kind: 'contract',
    });
  }

  const invoiceRows = detail.timeline.filter((r) => r.merge_source !== 'lifecycle' && r.invoice_id);
  if (invoiceRows.length === 0 && detail.subscription.status === 'active') {
    const gen = resolveGenerationYmd(
      detail.subscription.next_billing_date,
      detail.tenant_billing,
      detail.subscription.billing_interval
    );
    if (gen) {
      events.push({
        id: 'plan-ready',
        ymd: created ?? gen,
        title: 'Plano de cobrança preparado',
        kind: 'billing',
      });
    }
  }

  invoiceRows.forEach((row, idx) => {
    const ymd =
      normalizeYmdInput(row.invoice_created_at?.slice(0, 10)) ??
      normalizeYmdInput(row.due_date) ??
      normalizeYmdInput(row.cycle_date) ??
      '';
    if (!ymd) return;
    const isFirst = idx === invoiceRows.length - 1;
    events.push({
      id: `invoice-${row.invoice_id}`,
      ymd,
      title: isFirst ? 'Primeira cobrança gerada' : 'Cobrança gerada',
      detail: row.cycle_label,
      kind: 'billing',
    });
    if ((row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid') {
      const paidYmd = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? ymd;
      events.push({
        id: `paid-${row.invoice_id}`,
        ymd: paidYmd,
        title: 'Pagamento confirmado',
        detail: row.cycle_label,
        kind: 'payment',
      });
    }
  });

  detail.timeline
    .filter((r) => r.merge_source === 'lifecycle' || r.lifecycle_event)
    .forEach((row, idx) => {
      const ymd =
        normalizeYmdInput(row.cycle_date) ??
        normalizeYmdInput(row.processed_at?.slice(0, 10)) ??
        '';
      if (!ymd) return;
      events.push({
        id: `lifecycle-${idx}`,
        ymd,
        title: row.cycle_label || 'Evento da assinatura',
        detail: row.lifecycle_reason ?? row.generation_note,
        kind: 'lifecycle',
      });
    });

  const nextCharge =
    detail.automation_summary?.next_charge_ymd ??
    normalizeYmdInput(detail.subscription.next_billing_date);
  if (nextCharge && detail.subscription.status === 'active') {
    events.push({
      id: 'next-scheduled',
      ymd: nextCharge,
      title: 'Próxima cobrança agendada',
      kind: 'scheduled',
    });
  }

  const dedup = new Map<string, BusinessTimelineEvent>();
  for (const ev of events) dedup.set(`${ev.ymd}-${ev.title}-${ev.id}`, ev);
  return [...dedup.values()].sort((a, b) => a.ymd.localeCompare(b.ymd) || a.title.localeCompare(b.title));
}

export function buildFinancialHistoryRows(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialHistoryRow[] {
  return createFinancialEventStore(detail, todayYmd).getHistoryRows();
}

export function buildFinancialSummary(detail: CrmSubscriptionDetailPayload): FinancialSummary {
  const { stats } = detail;
  const paidRows = detail.timeline.filter(
    (r) => (r.invoice_status ?? '').toLowerCase() === 'paid' || r.operational_state === 'paid'
  );
  const paidCount = paidRows.length;
  const averageTicketCents = paidCount > 0 ? Math.round(stats.total_paid_cents / paidCount) : null;

  let lastPaymentYmd: string | null = null;
  for (const row of paidRows) {
    const ymd = normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? normalizeYmdInput(row.due_date);
    if (ymd && (!lastPaymentYmd || ymd > lastPaymentYmd)) lastPaymentYmd = ymd;
  }

  const today = new Date().toISOString().slice(0, 10);
  let maxOverdueDays: number | null = null;
  for (const row of detail.timeline) {
    const due = normalizeYmdInput(row.due_date);
    const inv = (row.invoice_status ?? '').toLowerCase();
    if (!due || due >= today || inv === 'paid' || row.operational_state === 'paid') continue;
    const dueDate = new Date(`${due}T12:00:00Z`);
    const now = new Date(`${today}T12:00:00Z`);
    const days = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
    if (maxOverdueDays == null || days > maxOverdueDays) maxOverdueDays = days;
  }

  const future = buildFutureCycles(detail, 12);
  const projectedRevenueCents =
    stats.total_pending_cents + future.reduce((sum, c) => sum + c.projectedAmountCents, 0);

  return {
    projectedRevenueCents,
    receivedRevenueCents: stats.total_paid_cents,
    openAmountCents: stats.total_pending_cents,
    invoiceCount: stats.charge_count,
    averageTicketCents,
    lastPaymentYmd,
    maxOverdueDays,
  };
}

export function buildSummaryCards(detail: CrmSubscriptionDetailPayload): SummaryCard[] {
  const head = subscriptionHeadlineStatus(detail);
  const nextDue = normalizeYmdInput(detail.subscription.next_billing_date);
  const nextGen =
    detail.automation_summary?.next_generation_ymd ??
    (nextDue
      ? resolveGenerationYmd(nextDue, detail.tenant_billing, detail.subscription.billing_interval)
      : null);
  const openCount = detail.timeline.filter((r) => {
    const inv = (r.invoice_status ?? '').toLowerCase();
    return r.invoice_id && inv !== 'paid' && r.operational_state !== 'paid' && r.operational_state !== 'cancelled';
  }).length;

  return [
    { key: 'status', label: 'Status', value: head.label },
    { key: 'next_gen', label: 'Próxima geração', value: nextGen ? formatYmdBrSafe(nextGen) : '—' },
    { key: 'next_due', label: 'Próximo vencimento', value: nextDue ? formatYmdBrSafe(nextDue) : '—' },
    {
      key: 'total_received',
      label: 'Total recebido',
      value: formatCentsBr(detail.stats.total_paid_cents),
    },
    {
      key: 'total_invoiced',
      label: 'Total faturado',
      value: formatCentsBr(detail.stats.total_invoiced_cents),
    },
    { key: 'open_invoices', label: 'Faturas em aberto', value: String(openCount) },
  ];
}

function formatCentsBr(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function advanceBillingDueYmd(ymd: string, interval: string): string {
  const head = normalizeYmdInput(ymd);
  if (!head) return ymd;
  const [yS, mS, dS] = head.split('-');
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10) - 1;
  const d = parseInt(dS, 10);
  const dt = new Date(Date.UTC(y, m, d));
  switch (interval) {
    case 'weekly':
      dt.setUTCDate(dt.getUTCDate() + 7);
      break;
    case 'monthly':
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      break;
    case 'quarterly':
      dt.setUTCMonth(dt.getUTCMonth() + 3);
      break;
    case 'semi_annual':
      dt.setUTCMonth(dt.getUTCMonth() + 6);
      break;
    case 'yearly':
      dt.setUTCFullYear(dt.getUTCFullYear() + 1);
      break;
    default:
      dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

export function buildFutureCycles(detail: CrmSubscriptionDetailPayload, count = 12): FutureCycleRow[] {
  const { subscription: s } = detail;
  if (s.status === 'cancelled' || s.status === 'completed') return [];
  let due = normalizeYmdInput(s.next_billing_date);
  if (!due) return [];

  let effectiveCount = count;
  if (s.cycles_unlimited === false && s.max_cycles != null && s.max_cycles >= 1) {
    const emitted = (detail.cycles_raw ?? []).filter((c) => Boolean(c.invoice_id?.trim())).length;
    const remaining = Math.max(0, Math.trunc(s.max_cycles) - emitted);
    effectiveCount = Math.min(count, remaining);
  }
  if (effectiveCount <= 0) return [];

  const rows: FutureCycleRow[] = [];
  const daysBefore = effectiveDaysBeforeFromTenantBilling(
    detail.tenant_billing,
    s.billing_interval
  );
  const statusPt = s.status === 'paused' ? 'Pausada' : 'Previsto';

  for (let i = 0; i < effectiveCount; i += 1) {
    const gen = computeRecurringGenerationDateYmd(due, daysBefore);
    rows.push({
      index: i + 1,
      competence: `${intervalLabel(s.billing_interval)} · ${formatYmdBrSafe(due)}`,
      generationYmd: gen,
      dueYmd: due,
      projectedAmountCents: s.amount_cents,
      projectedStatusPt: statusPt,
    });
    due = advanceBillingDueYmd(due, s.billing_interval);
  }
  return rows;
}

function mapWorkerStatusToSituation(workerStatus: string | null | undefined): SubscriptionSituation {
  const raw = (workerStatus ?? '').toLowerCase();
  if (!raw) {
    return {
      label: 'Cobrança agendada',
      visualState: 'scheduled',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }
  if (raw.includes('falha') || raw.includes('erro')) {
    return {
      label: 'Erro ao gerar cobrança',
      visualState: 'error',
      friendlyMessage: 'Houve um problema ao gerar esta cobrança.',
      hasError: true,
      technicalError: workerStatus ?? null,
    };
  }
  if (raw.includes('processando') || raw.includes('executando')) {
    return {
      label: 'Cobrança em processamento',
      visualState: 'generating',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }
  if (raw.includes('gateway') || raw.includes('pagamento')) {
    return {
      label: 'Pagamento aguardando confirmação',
      visualState: 'payment_pending',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }
  if (raw.includes('confirmado') || raw.includes('concluído') || raw.includes('pago')) {
    return {
      label: 'Pagamento confirmado',
      visualState: 'payment_confirmed',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }
  if (raw.includes('atrasad')) {
    return {
      label: 'Cobrança atrasada',
      visualState: 'error',
      friendlyMessage: 'Esta cobrança está em atraso.',
      hasError: true,
      technicalError: workerStatus ?? null,
    };
  }
  return {
    label: 'Cobrança agendada',
    visualState: 'scheduled',
    friendlyMessage: null,
    hasError: false,
    technicalError: null,
  };
}

export function resolveSubscriptionSituation(detail: CrmSubscriptionDetailPayload): SubscriptionSituation {
  const { subscription: s } = detail;
  if (s.status === 'paused') {
    return {
      label: 'Assinatura pausada',
      visualState: 'paused',
      friendlyMessage: 'Enquanto pausada, novas cobranças não são geradas.',
      hasError: false,
      technicalError: null,
    };
  }
  if (s.status === 'cancelled') {
    return {
      label: 'Assinatura cancelada',
      visualState: 'cancelled',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }

  const failedRow = detail.timeline.find(
    (r) => r.operational_state === 'failed' || r.operational_state === 'gateway_failed'
  );
  if (failedRow?.job_error_snippet) {
    return {
      label: 'Erro ao gerar cobrança',
      visualState: 'error',
      friendlyMessage: friendlyBillingMessage(failedRow.job_error_snippet) || 'Houve um problema ao gerar esta cobrança.',
      hasError: true,
      technicalError: failedRow.job_error_snippet,
    };
  }

  const pendingRow = detail.timeline.find((r) => {
    const inv = (r.invoice_status ?? '').toLowerCase();
    return r.invoice_id && inv === 'pending';
  });
  if (pendingRow) {
    return {
      label: 'Pagamento aguardando confirmação',
      visualState: 'payment_pending',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }

  const processingRow = detail.timeline.find(
    (r) => r.operational_state === 'processing' || r.operational_state === 'in_queue'
  );
  if (processingRow) {
    return {
      label: 'Cobrança em processamento',
      visualState: 'generating',
      friendlyMessage: null,
      hasError: false,
      technicalError: null,
    };
  }

  if (!detail.timeline.some((r) => r.invoice_id) && s.status === 'active') {
    return {
      label: 'Preparando cobrança',
      visualState: 'preparing',
      friendlyMessage: 'A estrutura de cobrança está a ser preparada.',
      hasError: false,
      technicalError: null,
    };
  }

  return mapWorkerStatusToSituation(detail.automation_summary?.worker_status_pt);
}

export function buildTechnicalDiagnostics(
  detail: CrmSubscriptionDetailPayload,
  latestJob?: CrmSubscriptionJobRow | null
): TechnicalDiagnostics {
  const job = latestJob ?? detail.recent_jobs[0] ?? null;
  const failedRow = detail.timeline.find((r) => r.job_error_snippet || r.job_id);
  const obs = detail.runtime_validation?.observability;
  return {
    workerStatus: detail.automation_summary?.worker_status_pt ?? job?.status ?? null,
    retryAt: job?.retry_at ?? failedRow?.job_retry_at ?? obs?.last_retry_at ?? null,
    cycleKey: job?.cycle_key ?? failedRow?.cycle_date ?? obs?.current_cycle_ymd ?? null,
    jobId: job?.id ?? failedRow?.job_id ?? obs?.job_id ?? null,
    engineVersion: obs?.engine_version ?? '3.0',
    executionTime: job?.updated_at ?? detail.automation_summary?.last_worker_check_at ?? null,
    stacktrace: job?.error_message ?? failedRow?.job_error_snippet ?? obs?.last_error ?? null,
    workerVersion: obs?.worker_version ?? null,
    executionVersion: obs?.execution_version ?? null,
    runtimeVersion: obs?.runtime_version ?? null,
    pipeline: obs?.pipeline ?? null,
    currentStage: obs?.current_stage ?? null,
    requestId: obs?.request_id ?? null,
    retryCount: obs?.retry_count ?? job?.attempts ?? null,
    workerAttempt: obs?.worker_attempt ?? job?.attempts ?? null,
    caller: obs?.caller ?? null,
    billingPlanId: obs?.billing_plan_id ?? null,
    billingPlanItemCount: obs?.billing_plan_item_count ?? null,
    currentCycleYmd: obs?.current_cycle_ymd ?? null,
    nextCycleYmd: obs?.next_cycle_ymd ?? null,
    currentInvoiceId: obs?.current_invoice_id ?? null,
    normalizedDates: obs?.normalized_dates ?? undefined,
    lastGenerationAt: obs?.last_generation_at ?? null,
    lastRetryAt: obs?.last_retry_at ?? null,
    lastError: obs?.last_error ?? null,
    lastErrorOrigin: obs?.last_error_origin
      ? {
          file: obs.last_error_origin.file,
          function: obs.last_error_origin.function,
          stackSummary: obs.last_error_origin.stack_summary,
        }
      : null,
  };
}

export function billingVisualStateLabel(state: BillingVisualState): string {
  const map: Record<BillingVisualState, string> = {
    preparing: 'Preparando cobrança',
    generating: 'Gerando cobrança',
    sending_gateway: 'Enviando ao gateway',
    payment_pending: 'Pagamento pendente',
    payment_confirmed: 'Pagamento confirmado',
    error: 'Erro',
    cancelled: 'Cancelada',
    paused: 'Pausada',
    scheduled: 'Cobrança agendada',
  };
  return map[state];
}

export function experienceLayoutColumns(viewportWidth: number): { main: number; aside: number } {
  if (viewportWidth < 768) return { main: 1, aside: 1 };
  if (viewportWidth < 1024) return { main: 1, aside: 1 };
  return { main: 2, aside: 1 };
}

export function subscriptionExperienceHeaderLines(detail: CrmSubscriptionDetailPayload): {
  planName: string;
  clientLabel: string;
  amountLabel: string;
  periodicityLabel: string;
  statusLabel: string;
  nextChargeLabel: string;
} {
  const s = detail.subscription;
  const head = subscriptionHeadlineStatus(detail);
  const nextDue = normalizeYmdInput(s.next_billing_date);
  return {
    planName: detail.plan_label?.trim() || 'Assinatura recorrente',
    clientLabel: detail.client_name?.trim() || (s.customer_id ? 'Cliente CRM' : 'Por link'),
    amountLabel: `${formatCentsBr(s.amount_cents)} / ${intervalLabel(s.billing_interval)}`,
    periodicityLabel: detail.meta?.periodicity_label_pt ?? intervalLabel(s.billing_interval),
    statusLabel: head.label,
    nextChargeLabel: nextDue ? formatYmdBrSafe(nextDue) : '—',
  };
}
