/**
 * Timeline operacional de assinaturas (somente leitura / UX).
 * Não altera cycle_key, next_billing_date, motor de recorrência nem geração antecipada.
 */
import type { SubscriptionCycleDbRow } from './subscriptionCyclesQueryService.js';

/** Shape mínimo das faturas no detalhe CRM (evita ciclo de import com crmSubscriptionsService). */
export type TimelineInvoiceInput = {
  id: string;
  amount_cents: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  created_at: string;
  gateway_status: string | null;
  gateway_reference_id: string | null;
};

export type TimelineJobInput = {
  id: string;
  cycle_key: string;
  status: string;
  retry_at: string | null;
  attempts: number;
  max_attempts: number;
  result_invoice_id: string | null;
  error_message: string | null;
  completion_outcome: string | null;
  updated_at: string;
};
import {
  clampRecurringInvoiceGenerateDaysBeforeDue,
  computeRecurringInvoiceGenerationDateYmd,
} from '../utils/billingGenerationDate.js';

export type SubscriptionTimelineOperationalState =
  | 'scheduled'
  | 'awaiting_generation'
  | 'in_queue'
  | 'processing'
  | 'generated'
  | 'paid'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'gateway_failed'
  | 'manual_invoice';

export interface CrmSubscriptionTimelineRowUx {
  /** Legado: igual a `cycle_subtitle` (evita MM/yyyy ambíguo na UI nova). */
  month_ref: string;
  cycle_label: string;
  cycle_subtitle: string;
  cycle_date: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status_pt: string;
  operational_state: SubscriptionTimelineOperationalState;
  operational_state_pt: string;
  amount_cents: number | null;
  invoice_id: string | null;
  invoice_created_at: string | null;
  generation_note: string | null;
  cycle_status: string | null;
  cycle_id: string | null;
  job_id: string | null;
  job_status: string | null;
  job_attempts: number | null;
  job_max_attempts: number | null;
  job_retry_at: string | null;
  job_error_snippet: string | null;
  has_auto_retry: boolean;
  processed_at: string | null;
  invoice_status: string | null;
  gateway_status: string | null;
  gateway_reference_id: string | null;
  merge_source: 'cycle' | 'invoice_only';
}

export interface CrmSubscriptionAutomationSummary {
  last_generation_at: string | null;
  last_generation_label: string | null;
  next_generation_ymd: string | null;
  next_charge_ymd: string | null;
  worker_status_pt: string;
  last_worker_check_at: string | null;
}

const MONTHS_PT_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

function ymdHead(ymd: string | null | undefined): string | null {
  if (!ymd || ymd.length < 10) return null;
  return ymd.slice(0, 10);
}

function formatYmdPt(ymd: string | null | undefined): string {
  const h = ymdHead(ymd);
  if (!h) return '—';
  return `${h.slice(8, 10)}/${h.slice(5, 7)}/${h.slice(0, 4)}`;
}

function formatPeriodPt(start: string | null, end: string | null): string {
  if (start && end) return `${formatYmdPt(start)} → ${formatYmdPt(end)}`;
  if (start) return formatYmdPt(start);
  return '—';
}

function civilMonthShort(ymd: string | null | undefined): string {
  const h = ymdHead(ymd);
  if (!h) return '—';
  const m = parseInt(h.slice(5, 7), 10);
  const y = h.slice(0, 4);
  const name = MONTHS_PT_SHORT[m - 1] ?? h.slice(5, 7);
  return `${name}/${y}`;
}

function buildCycleLabels(cycleDateYmd: string | null, dueYmd: string | null): {
  cycle_label: string;
  cycle_subtitle: string;
} {
  const due = ymdHead(dueYmd) ?? ymdHead(cycleDateYmd);
  const cycle = ymdHead(cycleDateYmd) ?? due;
  if (!due && !cycle) {
    return { cycle_label: 'Ciclo', cycle_subtitle: '—' };
  }
  const duePt = formatYmdPt(due);
  const cyclePt = cycle && cycle !== due ? formatYmdPt(cycle) : null;
  const cycle_label = cyclePt
    ? `Ciclo ${cyclePt} · Venc. ${duePt}`
    : `Ciclo · Vencimento ${duePt}`;
  const cycle_subtitle = `${civilMonthShort(due)} · Venc. ${duePt.slice(0, 5)}`;
  return { cycle_label, cycle_subtitle };
}

function normalizeCycleKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function findJobForRow(
  row: {
    job_id: string | null;
    cycle_date: string | null;
    period_start: string | null;
    due_date: string | null;
  },
  jobs: TimelineJobInput[]
): TimelineJobInput | null {
  if (row.job_id) {
    const byId = jobs.find((j) => j.id === row.job_id);
    if (byId) return byId;
  }
  const keys = [
    normalizeCycleKey(row.cycle_date),
    normalizeCycleKey(row.period_start),
    normalizeCycleKey(row.due_date),
  ].filter(Boolean);
  for (const key of keys) {
    const exact = jobs.find((j) => normalizeCycleKey(j.cycle_key) === key);
    if (exact) return exact;
  }
  for (const key of keys) {
    const partial = jobs.find((j) => normalizeCycleKey(j.cycle_key).startsWith(key));
    if (partial) return partial;
  }
  return null;
}

function isGatewayChargeFailed(
  invoiceStatus: string | null | undefined,
  gatewayStatus: string | null | undefined,
  gatewayRef: string | null | undefined
): boolean {
  const gs = (gatewayStatus ?? '').trim().toLowerCase();
  if (gs === 'failed' || gs === 'refused' || gs === 'chargeback') return true;
  const inv = (invoiceStatus ?? '').trim().toLowerCase();
  if (inv === 'failed') return true;
  if (gatewayRef?.trim()) return false;
  return false;
}

function invoiceStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Aguardando pagamento',
    waiting_payment: 'Aguardando pagamento',
    processing: 'Processando pagamento',
    paid: 'Pago',
    overdue: 'Vencido',
    cancelled: 'Cancelado',
    failed: 'Falhou',
    refunded: 'Reembolsado',
  };
  return m[status] ?? status;
}

function cycleStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Aguardando geração',
    queued: 'Agendado',
    processing: 'Processando',
    invoiced: 'Fatura gerada',
    skipped: 'Sem nova fatura',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };
  return m[status] ?? status;
}

function isJobGenerationFailure(job: TimelineJobInput | null): boolean {
  if (!job) return false;
  if (job.status === 'failed') return true;
  if (job.attempts >= job.max_attempts && job.status === 'pending') return true;
  if (job.completion_outcome === 'failed_max_attempts') return true;
  return Boolean(job.error_message?.trim()) && job.status === 'failed';
}

function buildGenerationNote(inv: TimelineInvoiceInput | undefined, dueYmd: string | null): string | null {
  if (!inv?.created_at) return null;
  const created = inv.created_at.slice(0, 10);
  const due = ymdHead(dueYmd);
  if (!created) return null;
  const at = formatYmdPt(created);
  if (due && created < due) {
    return `Gerada automaticamente em ${at}`;
  }
  if (due && created === due) {
    return `Gerada em ${at}`;
  }
  return `Fatura criada em ${at}`;
}

function resolveOperationalState(params: {
  cycleStatus: string | null;
  inv: TimelineInvoiceInput | undefined;
  job: TimelineJobInput | null;
  mergeSource: 'cycle' | 'invoice_only';
}): { state: SubscriptionTimelineOperationalState; statePt: string; statusPt: string } {
  const { inv, job, mergeSource } = params;
  const cycle = (params.cycleStatus ?? '').toLowerCase();

  if (inv) {
    if (inv.status === 'paid') {
      return { state: 'paid', statePt: 'Pago', statusPt: 'Pago' };
    }
    if (
      isGatewayChargeFailed(inv.status, inv.gateway_status, inv.gateway_reference_id) &&
      inv.status !== 'cancelled'
    ) {
      return {
        state: 'gateway_failed',
        statePt: 'Falha na cobrança',
        statusPt: 'Falha na cobrança',
      };
    }
    return {
      state: 'generated',
      statePt: 'Gerado',
      statusPt: invoiceStatusLabelPt(inv.status),
    };
  }

  if (isJobGenerationFailure(job)) {
    return { state: 'failed', statePt: 'Falhou', statusPt: 'Falha na geração' };
  }

  if (cycle === 'failed') {
    return { state: 'failed', statePt: 'Falhou', statusPt: cycleStatusLabelPt('failed') };
  }
  if (cycle === 'cancelled') {
    return { state: 'cancelled', statePt: 'Cancelado', statusPt: cycleStatusLabelPt('cancelled') };
  }
  if (cycle === 'skipped') {
    return { state: 'skipped', statePt: 'Sem nova fatura', statusPt: cycleStatusLabelPt('skipped') };
  }
  if (cycle === 'processing' || job?.status === 'processing') {
    return { state: 'processing', statePt: 'Processando', statusPt: 'Processando' };
  }
  if (cycle === 'invoiced') {
    return { state: 'generated', statePt: 'Gerado', statusPt: cycleStatusLabelPt('invoiced') };
  }
  if (cycle === 'queued') {
    return { state: 'scheduled', statePt: 'Agendado', statusPt: cycleStatusLabelPt('queued') };
  }
  if (cycle === 'pending') {
    return {
      state: 'awaiting_generation',
      statePt: 'Aguardando geração',
      statusPt: cycleStatusLabelPt('pending'),
    };
  }
  if (job?.status === 'pending') {
    return { state: 'in_queue', statePt: 'Em fila', statusPt: 'Em fila' };
  }
  if (mergeSource === 'invoice_only') {
    return { state: 'manual_invoice', statePt: 'Fatura avulsa', statusPt: 'Fatura na assinatura' };
  }

  return {
    state: 'awaiting_generation',
    statePt: 'Aguardando geração',
    statusPt: cycle ? cycleStatusLabelPt(cycle) : 'Aguardando geração',
  };
}

function hasAutoRetry(job: TimelineJobInput | null): boolean {
  if (!job?.retry_at) return false;
  return new Date(job.retry_at).getTime() > Date.now();
}

function buildTimelineRow(params: {
  cycle: SubscriptionCycleDbRow | null;
  inv: TimelineInvoiceInput | undefined;
  subscriptionAmountCents: number;
  job: TimelineJobInput | null;
  mergeSource: 'cycle' | 'invoice_only';
}): CrmSubscriptionTimelineRowUx {
  const { cycle, inv, subscriptionAmountCents, job, mergeSource } = params;
  const cycleDateYmd = ymdHead(cycle?.cycle_date) ?? ymdHead(inv?.period_start) ?? null;
  const ps =
    ymdHead(cycle?.period_start) ?? ymdHead(inv?.period_start) ?? cycleDateYmd;
  const pe = ymdHead(cycle?.period_end) ?? ymdHead(inv?.period_end) ?? null;
  const due = ymdHead(inv?.due_date) ?? cycleDateYmd ?? ps;
  const { cycle_label, cycle_subtitle } = buildCycleLabels(cycleDateYmd, due);
  const op = resolveOperationalState({
    cycleStatus: cycle?.status ?? null,
    inv,
    job,
    mergeSource,
  });
  const amount = inv?.amount_cents ?? subscriptionAmountCents;
  const retryPending = hasAutoRetry(job);

  return {
    month_ref: cycle_subtitle,
    cycle_label,
    cycle_subtitle,
    cycle_date: cycleDateYmd,
    period_label: formatPeriodPt(ps, pe),
    period_start: ps,
    period_end: pe,
    due_date: due,
    status_pt: op.statusPt,
    operational_state: op.state,
    operational_state_pt: op.statePt,
    amount_cents: amount,
    invoice_id: inv?.id ?? cycle?.invoice_id ?? null,
    invoice_created_at: inv?.created_at ?? null,
    generation_note: buildGenerationNote(inv, due),
    cycle_status: cycle?.status ?? null,
    cycle_id: cycle?.id ?? null,
    job_id: job?.id ?? cycle?.job_id ?? null,
    job_status: job?.status ?? null,
    job_attempts: job?.attempts ?? null,
    job_max_attempts: job?.max_attempts ?? null,
    job_retry_at: job?.retry_at ?? null,
    job_error_snippet: job?.error_message?.trim().slice(0, 200) ?? cycle?.error_message?.trim().slice(0, 200) ?? null,
    has_auto_retry: retryPending,
    processed_at: cycle?.processed_at ?? null,
    invoice_status: inv?.status ?? null,
    gateway_status: inv?.gateway_status ?? null,
    gateway_reference_id: inv?.gateway_reference_id ?? null,
    merge_source: mergeSource,
  };
}

export function buildSubscriptionTimeline(
  cycles: SubscriptionCycleDbRow[],
  invoices: TimelineInvoiceInput[],
  subscriptionAmountCents: number,
  cyclesReadEnabled: boolean,
  recentJobs: TimelineJobInput[] = []
): CrmSubscriptionTimelineRowUx[] {
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const rows: CrmSubscriptionTimelineRowUx[] = [];
  const usedInvoiceIds = new Set<string>();

  if (cyclesReadEnabled && cycles.length > 0) {
    for (const c of cycles) {
      const inv = c.invoice_id ? invById.get(c.invoice_id) : undefined;
      if (inv) usedInvoiceIds.add(inv.id);
      const job = findJobForRow(
        {
          job_id: c.job_id,
          cycle_date: c.cycle_date,
          period_start: c.period_start,
          due_date: inv?.due_date ?? c.cycle_date,
        },
        recentJobs
      );
      rows.push(
        buildTimelineRow({
          cycle: c,
          inv,
          subscriptionAmountCents,
          job,
          mergeSource: 'cycle',
        })
      );
    }
  }

  for (const inv of invoices) {
    if (usedInvoiceIds.has(inv.id)) continue;
    const job = findJobForRow(
      {
        job_id: null,
        cycle_date: null,
        period_start: inv.period_start,
        due_date: inv.due_date,
      },
      recentJobs
    );
    rows.push(
      buildTimelineRow({
        cycle: null,
        inv,
        subscriptionAmountCents,
        job,
        mergeSource: 'invoice_only',
      })
    );
  }

  rows.sort((a, b) => {
    const da = a.period_start ?? a.due_date ?? a.cycle_date ?? '';
    const db = b.period_start ?? b.due_date ?? b.cycle_date ?? '';
    return db.localeCompare(da);
  });

  return rows;
}

export function buildSubscriptionAutomationSummary(params: {
  subscriptionStatus: string;
  nextBillingDate: string | null | undefined;
  lastJobAt: string | null | undefined;
  recurringInvoiceGenerateDaysBeforeDue: number | null | undefined;
  recentJobs: TimelineJobInput[];
  timeline: CrmSubscriptionTimelineRowUx[];
}): CrmSubscriptionAutomationSummary {
  const nextCharge = ymdHead(params.nextBillingDate);
  const daysBefore = clampRecurringInvoiceGenerateDaysBeforeDue(
    params.recurringInvoiceGenerateDaysBeforeDue
  );
  const nextGeneration =
    nextCharge && nextCharge.length === 10
      ? computeRecurringInvoiceGenerationDateYmd(nextCharge, daysBefore)
      : null;

  const invoicedRows = params.timeline.filter((r) => r.invoice_created_at);
  const lastInv = invoicedRows[0];
  const lastGenAt = lastInv?.invoice_created_at ?? null;
  const lastGenLabel = lastInv?.generation_note ?? (lastGenAt ? formatYmdPt(lastGenAt.slice(0, 10)) : null);

  const nextKey = normalizeCycleKey(nextCharge);
  const job =
    params.recentJobs.find((j) => normalizeCycleKey(j.cycle_key) === nextKey) ??
    params.recentJobs.find((j) => ['pending', 'processing'].includes(j.status)) ??
    null;

  const lastCheck = job?.updated_at ?? params.lastJobAt ?? null;

  let worker_status_pt = 'Monitorização ativa';
  if (params.subscriptionStatus !== 'active') {
    worker_status_pt = 'Assinatura inativa';
  } else if (job && isJobGenerationFailure(job)) {
    worker_status_pt = 'Falha na geração';
  } else if (job?.status === 'processing') {
    worker_status_pt = 'Processando agora';
  } else if (job?.status === 'pending' || !job) {
    worker_status_pt = hasAutoRetry(job) ? 'Reprocessamento agendado' : 'Aguardando fila';
  } else if (job.status === 'completed' && job.result_invoice_id) {
    worker_status_pt = 'Último ciclo concluído';
  }

  return {
    last_generation_at: lastGenAt,
    last_generation_label: lastGenLabel,
    next_generation_ymd: nextGeneration,
    next_charge_ymd: nextCharge,
    worker_status_pt,
    last_worker_check_at: lastCheck,
  };
}
