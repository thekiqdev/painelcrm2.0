/**
 * Resolver canônico da próxima cobrança elegível (Sprint 4.1K).
 * Única fonte de verdade — nenhum componente calcula a próxima competência isoladamente.
 */
import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';
import { advanceBillingDueYmd, normalizeYmdInput } from './billingSubscriptionExperience';
import { cycleDueYmd } from './subscriptionRenewalRecovery';

export type NextInvoiceCandidateSource = 'timeline' | 'cycles_raw' | 'projected';

export type NextInvoiceCandidate = {
  row: CrmSubscriptionTimelineRow;
  source: NextInvoiceCandidateSource;
  dueYmd: string;
  periodStart: string | null;
  periodEnd: string | null;
  amountCents: number;
  invoiceId: string | null;
  hasInvoice: boolean;
};

const AWAITING_OPERATIONAL = new Set([
  'scheduled',
  'awaiting_generation',
  'in_queue',
  'processing',
  'failed',
  'skipped',
  'gateway_failed',
]);

function isLifecycleRow(row: CrmSubscriptionTimelineRow): boolean {
  return row.merge_source === 'lifecycle';
}

function isCancelledRow(row: CrmSubscriptionTimelineRow): boolean {
  if (row.operational_state === 'cancelled') return true;
  const inv = (row.invoice_status ?? '').toLowerCase();
  return inv === 'cancelled' || row.status_pt === 'Cancelada';
}

function isPaidRow(row: CrmSubscriptionTimelineRow): boolean {
  if (row.operational_state === 'paid') return true;
  return (row.invoice_status ?? '').toLowerCase() === 'paid';
}

function isInvoicedRow(row: CrmSubscriptionTimelineRow): boolean {
  return Boolean(row.invoice_id);
}

function sortRowsByDue(rows: CrmSubscriptionTimelineRow[]): CrmSubscriptionTimelineRow[] {
  return [...rows].sort((a, b) => {
    const da = cycleDueYmd(a) ?? '';
    const db = cycleDueYmd(b) ?? '';
    return da.localeCompare(db);
  });
}

function timelineBillingRows(detail: CrmSubscriptionDetailPayload): CrmSubscriptionTimelineRow[] {
  return detail.timeline.filter((r) => !isLifecycleRow(r));
}

function rowFromCyclesRaw(
  detail: CrmSubscriptionDetailPayload,
  dueYmd: string
): CrmSubscriptionTimelineRow | null {
  const raw = detail.cycles_raw?.find((c) => normalizeYmdInput(c.cycle_date) === dueYmd);
  if (!raw) return null;
  return {
    month_ref: dueYmd.slice(0, 7),
    cycle_label: dueYmd,
    cycle_subtitle: '',
    cycle_date: dueYmd,
    period_label: dueYmd,
    period_start: normalizeYmdInput(raw.period_start) ?? dueYmd,
    period_end: normalizeYmdInput(raw.period_end) ?? null,
    due_date: dueYmd,
    status_pt: 'Aguardando',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: detail.subscription.amount_cents,
    invoice_id: raw.invoice_id,
    cycle_status: raw.status,
    cycle_id: raw.id,
    job_id: raw.job_id,
    merge_source: 'cycle',
  };
}

function syntheticProjectedRow(
  detail: CrmSubscriptionDetailPayload,
  dueYmd: string
): CrmSubscriptionTimelineRow {
  const interval = detail.subscription.billing_interval;
  const periodEnd = advanceBillingDueYmd(dueYmd, interval);
  return {
    month_ref: dueYmd.slice(0, 7),
    cycle_label: dueYmd,
    cycle_subtitle: '',
    cycle_date: dueYmd,
    period_label: dueYmd,
    period_start: dueYmd,
    period_end: periodEnd,
    due_date: dueYmd,
    status_pt: 'Prevista',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: detail.subscription.amount_cents,
    invoice_id: null,
    cycle_status: 'pending',
    cycle_id: null,
    job_id: null,
    merge_source: 'cycle',
  };
}

function maxDueYmd(rows: CrmSubscriptionTimelineRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const due = cycleDueYmd(r);
    if (!due) continue;
    if (!max || due > max) max = due;
  }
  return max;
}

function projectNextDueYmd(detail: CrmSubscriptionDetailPayload, rows: CrmSubscriptionTimelineRow[]): string | null {
  const interval = detail.subscription.billing_interval;
  const invoicedDues = new Set(
    rows.filter((r) => isInvoicedRow(r)).map((r) => cycleDueYmd(r)).filter(Boolean) as string[]
  );

  let anchor =
    maxDueYmd(rows) ??
    normalizeYmdInput(detail.automation_summary?.next_charge_ymd) ??
    normalizeYmdInput(detail.subscription.next_billing_date);
  if (!anchor) return null;

  if (!invoicedDues.has(anchor) && !rows.some((r) => cycleDueYmd(r) === anchor && !isInvoicedRow(r))) {
    return anchor;
  }

  let cursor = anchor;
  for (let i = 0; i < 64; i += 1) {
    cursor = advanceBillingDueYmd(cursor, interval);
    const existing = rows.find((r) => cycleDueYmd(r) === cursor);
    if (!existing) return cursor;
    if (!isInvoicedRow(existing) && !isCancelledRow(existing) && !isPaidRow(existing)) {
      return cursor;
    }
    if (!isInvoicedRow(existing)) return cursor;
  }
  return advanceBillingDueYmd(anchor, interval);
}

function toCandidate(
  row: CrmSubscriptionTimelineRow,
  source: NextInvoiceCandidateSource,
  detail: CrmSubscriptionDetailPayload
): NextInvoiceCandidate {
  const dueYmd = cycleDueYmd(row) ?? '';
  const invoiceId = row.invoice_id ?? null;
  return {
    row,
    source,
    dueYmd,
    periodStart: normalizeYmdInput(row.period_start) ?? dueYmd,
    periodEnd: normalizeYmdInput(row.period_end),
    amountCents: row.amount_cents ?? detail.subscription.amount_cents,
    invoiceId,
    hasInvoice: Boolean(invoiceId),
  };
}

/**
 * Primeiro ciclo futuro sem invoice (ou projetado a partir do contrato).
 */
export function getNextAwaitingGenerationCycle(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): CrmSubscriptionTimelineRow | null {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  if (detail.subscription.status === 'cancelled') return null;

  const rows = sortRowsByDue(timelineBillingRows(detail));

  for (const row of rows) {
    if (isCancelledRow(row) || isPaidRow(row)) continue;
    if (isInvoicedRow(row)) continue;
    const due = cycleDueYmd(row);
    if (!due) continue;
    if (due < today && row.operational_state !== 'failed' && row.cycle_status !== 'failed') {
      continue;
    }
    return row;
  }

  for (const row of rows) {
    if (isInvoicedRow(row) || isCancelledRow(row) || isPaidRow(row)) continue;
    if (AWAITING_OPERATIONAL.has(row.operational_state)) return row;
  }

  const projectedDue = projectNextDueYmd(detail, rows);
  if (!projectedDue) return null;

  const fromRaw = rowFromCyclesRaw(detail, projectedDue);
  if (fromRaw && !isInvoicedRow(fromRaw)) return fromRaw;

  const existing = rows.find((r) => cycleDueYmd(r) === projectedDue);
  if (existing && !isInvoicedRow(existing)) return existing;

  return syntheticProjectedRow(detail, projectedDue);
}

export function hasFutureCyclesWithoutInvoice(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): boolean {
  const cycle = getNextAwaitingGenerationCycle(detail, todayYmd);
  return cycle != null && !cycle.invoice_id;
}

export function resolveNextInvoiceCandidate(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): NextInvoiceCandidate | null {
  const row = getNextAwaitingGenerationCycle(detail, todayYmd);
  if (!row) return null;

  const due = cycleDueYmd(row);
  if (!due) return null;

  const fromTimeline = timelineBillingRows(detail).some(
    (r) => cycleDueYmd(r) === due && (!row.cycle_id || r.cycle_id === row.cycle_id)
  );
  const fromRaw = detail.cycles_raw?.some((c) => normalizeYmdInput(c.cycle_date) === due);
  const source: NextInvoiceCandidateSource = fromTimeline
    ? 'timeline'
    : fromRaw
      ? 'cycles_raw'
      : 'projected';

  return toCandidate(row, source, detail);
}
