import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionJobRow,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';
import { normalizeYmdInput } from './billingSubscriptionExperience';
import { formatDateTimeBrSafe } from './billingSafeDate';

/** Padrão de `Date.prototype.toString()` — nunca persistir nem enviar ao billing. */
export const JS_DATE_STRING_HEAD_RE = /^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}/;

export type WorkerHistoryEntry = {
  id: string;
  atIso: string;
  dateLabel: string;
  label: string;
  error: string | null;
  cycleKey: string | null;
};

export type HistoryFinancialStatus =
  | 'prevista'
  | 'pendente'
  | 'emitida'
  | 'paga'
  | 'cancelada'
  | 'reembolsada'
  | 'falhou';

import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import { getNextAwaitingGenerationCycle } from './subscriptionNextInvoiceResolver';
import { buildSubscriptionFinancialEvents, resolveNextChargeEvent } from './subscriptionFinancialEvents';

export function historyRowShowsChargeAction(row: FinancialHistoryRow): boolean {
  if (row.canGenerateNow) return true;
  if (row.invoiceId) return false;
  if (row.visual === 'paid') return false;
  if (row.visual === 'cancelled') return false;
  if (!row.invoiceId && (row.visual === 'future' || row.statusPt === 'Prevista' || row.statusPt === 'Pendente')) {
    return Boolean(row.isNextCharge);
  }
  return false;
}

export function historyRowChargeActionLabel(_row: FinancialHistoryRow): string {
  return 'Gerar cobrança';
}

export function isJsDateStringFormat(value: string): boolean {
  return JS_DATE_STRING_HEAD_RE.test(value.trim());
}

/**
 * Normaliza entrada de data para YYYY-MM-DD.
 * Rejeita `Date.toString()` e formatos não-ISO; aceita YMD estrito e ISO8601.
 */
export function sanitizeBillingDateInput(value: unknown): string | null {
  return normalizeBillingDateInput(value);
}

/** Alias do normalizador único (frontend). */
export function normalizeBillingDate(value: unknown): string | null {
  return sanitizeBillingDateInput(value);
}

function normalizeBillingDateInput(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  if (isJsDateStringFormat(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return null;
  }
  const headYmd = normalizeYmdInput(s.slice(0, 10));
  if (headYmd) return headYmd;
  return normalizeYmdInput(s);
}

export function cycleDueYmd(
  row: Pick<CrmSubscriptionTimelineRow, 'due_date' | 'cycle_date'>
): string | null {
  return normalizeYmdInput(row.due_date) ?? normalizeYmdInput(row.cycle_date);
}

/**
 * Ciclo `failed` sem invoice e com vencimento >= hoje ainda pode ser gerado manualmente.
 */
export function isRecoverableCycleFailure(
  row: Pick<
    CrmSubscriptionTimelineRow,
    'operational_state' | 'invoice_id' | 'due_date' | 'cycle_date' | 'cycle_status'
  >,
  todayYmd: string
): boolean {
  if (row.invoice_id) return false;
  const state = row.operational_state;
  const cycle = (row.cycle_status ?? '').toLowerCase();
  const isFailed = state === 'failed' || cycle === 'failed';
  if (!isFailed) return false;
  const due = cycleDueYmd(row);
  if (!due) return true;
  return due >= todayYmd;
}

export function isDefinitiveCycleFailure(
  row: Pick<
    CrmSubscriptionTimelineRow,
    'operational_state' | 'invoice_id' | 'due_date' | 'cycle_date' | 'cycle_status'
  >,
  todayYmd: string
): boolean {
  if (row.invoice_id) return false;
  const state = row.operational_state;
  if (state !== 'failed' && (row.cycle_status ?? '').toLowerCase() !== 'failed') return false;
  return !isRecoverableCycleFailure(row, todayYmd);
}

export function mapHistoryFinancialStatus(
  row: Pick<
    CrmSubscriptionTimelineRow,
    | 'operational_state'
    | 'invoice_id'
    | 'invoice_status'
    | 'due_date'
    | 'cycle_date'
    | 'cycle_status'
  >,
  todayYmd: string
): HistoryFinancialStatus {
  const inv = (row.invoice_status ?? '').toLowerCase();
  if (inv === 'paid' || row.operational_state === 'paid') return 'paga';
  if (inv === 'cancelled' || row.operational_state === 'cancelled') return 'cancelada';
  if (inv === 'refunded' || row.operational_state === 'skipped') return 'reembolsada';
  if (isRecoverableCycleFailure(row, todayYmd)) return 'pendente';
  if (isDefinitiveCycleFailure(row, todayYmd)) return 'falhou';
  if (row.invoice_id) {
    if (inv === 'pending' || inv === 'overdue') return 'emitida';
    return 'emitida';
  }
  const due = cycleDueYmd(row);
  if (
    row.operational_state === 'awaiting_generation' ||
    row.operational_state === 'in_queue' ||
    row.operational_state === 'processing'
  ) {
    return 'pendente';
  }
  if (row.operational_state === 'scheduled') {
    return due && due > todayYmd ? 'prevista' : 'pendente';
  }
  if (due && due > todayYmd) return 'prevista';
  return 'pendente';
}

export function historyFinancialStatusLabel(status: HistoryFinancialStatus): string {
  const map: Record<HistoryFinancialStatus, string> = {
    prevista: 'Prevista',
    pendente: 'Pendente',
    emitida: 'Emitida',
    paga: 'Paga',
    cancelada: 'Cancelada',
    reembolsada: 'Reembolsada',
    falhou: 'Falhou',
  };
  return map[status];
}

export function workerHistoryFromJob(job: CrmSubscriptionJobRow): WorkerHistoryEntry | null {
  const err = job.error_message?.trim();
  if (!err && job.status !== 'failed') return null;
  return {
    id: job.id,
    atIso: job.updated_at,
    dateLabel: formatDateTimeBrSafe(job.updated_at),
    label: job.attempts > 1 ? 'Tentativa automática (retry)' : 'Tentativa automática',
    error: err ?? null,
    cycleKey: job.cycle_key?.trim() || null,
  };
}

export function buildWorkerHistoryEntries(detail: CrmSubscriptionDetailPayload): WorkerHistoryEntry[] {
  const seen = new Set<string>();
  const entries: WorkerHistoryEntry[] = [];

  for (const job of detail.recent_jobs) {
    const entry = workerHistoryFromJob(job);
    if (!entry) continue;
    const key = `${entry.id}-${entry.atIso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  for (const row of detail.timeline) {
    const snippet = row.job_error_snippet?.trim();
    if (!snippet || row.invoice_id) continue;
    const at = row.processed_at ?? row.job_retry_at;
    const id = row.job_id ?? `timeline-${row.cycle_id ?? row.due_date}`;
    const key = `${id}-${snippet.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      id,
      atIso: at ?? '',
      dateLabel: at ? formatDateTimeBrSafe(at) : '—',
      label: row.has_auto_retry ? 'Tentativa automática (retry)' : 'Tentativa automática',
      error: snippet,
      cycleKey: row.cycle_date,
    });
  }

  return entries.sort((a, b) => b.atIso.localeCompare(a.atIso));
}

export function findNextChargeTimelineRow(
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): CrmSubscriptionTimelineRow | null {
  const events = buildSubscriptionFinancialEvents(detail, todayYmd);
  const nextEv = resolveNextChargeEvent(events, todayYmd);
  if (nextEv?.dueYmd) {
    const fromTimeline = detail.timeline.find(
      (r) =>
        r.merge_source !== 'lifecycle' &&
        cycleDueYmd(r) === nextEv.dueYmd &&
        !r.invoice_id
    );
    if (fromTimeline) return fromTimeline;
  }
  return getNextAwaitingGenerationCycle(detail, todayYmd);
}
