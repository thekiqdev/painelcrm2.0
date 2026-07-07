/**
 * Sprint 4.2G / 5.0-23B — Fonte única: subscription_cycles (cycles_raw).
 * Algoritmos de competência operacional: operationalCompetencyResolver.ts (OCRE).
 */
import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';
import { normalizeYmdInput } from './billingSubscriptionExperience';
import { GENERATABLE_CYCLE_STATUSES } from './operationalCompetencyResolverCore';

export { GENERATABLE_CYCLE_STATUSES };

export type SubscriptionCycleRaw = CrmSubscriptionDetailPayload['cycles_raw'][number];

/** Ciclos ordenados por cycle_date (asc). */
export function listCyclesFromDetail(detail: CrmSubscriptionDetailPayload): SubscriptionCycleRaw[] {
  return [...(detail.cycles_raw ?? [])].sort((a, b) =>
    a.cycle_date.localeCompare(b.cycle_date) || a.id.localeCompare(b.id)
  );
}

export function findCycleById(
  detail: CrmSubscriptionDetailPayload,
  cycleId: string | null | undefined
): SubscriptionCycleRaw | null {
  if (!cycleId?.trim()) return null;
  return detail.cycles_raw?.find((c) => c.id === cycleId.trim()) ?? null;
}

export function findCycleByInvoiceId(
  detail: CrmSubscriptionDetailPayload,
  invoiceId: string | null | undefined
): SubscriptionCycleRaw | null {
  if (!invoiceId?.trim()) return null;
  return detail.cycles_raw?.find((c) => c.invoice_id === invoiceId.trim()) ?? null;
}

export function timelineRowForCycle(
  detail: CrmSubscriptionDetailPayload,
  cycle: SubscriptionCycleRaw
): CrmSubscriptionTimelineRow | null {
  const byId = detail.timeline.find((r) => r.cycle_id === cycle.id);
  if (byId && byId.merge_source !== 'lifecycle') return byId;
  if (cycle.invoice_id) {
    const byInv = detail.timeline.find(
      (r) => r.invoice_id === cycle.invoice_id && r.merge_source !== 'lifecycle'
    );
    if (byInv) return byInv;
  }
  const due = normalizeYmdInput(cycle.cycle_date);
  if (due) {
    const byDate = detail.timeline.find(
      (r) =>
        r.merge_source !== 'lifecycle' &&
        (normalizeYmdInput(r.cycle_date) === due || normalizeYmdInput(r.due_date) === due)
    );
    if (byDate) return byDate;
  }
  return cycleToTimelineRow(cycle, detail);
}

/** Linha mínima derivada exclusivamente de subscription_cycles (sem projeção). */
export function cycleToTimelineRow(
  cycle: SubscriptionCycleRaw,
  detail: CrmSubscriptionDetailPayload
): CrmSubscriptionTimelineRow {
  const due = normalizeYmdInput(cycle.cycle_date) ?? cycle.cycle_date;
  const ps = normalizeYmdInput(cycle.period_start) ?? due;
  const pe = normalizeYmdInput(cycle.period_end);
  const hasInvoice = Boolean(cycle.invoice_id);
  const failed = cycle.status === 'failed';
  const skipped = cycle.status === 'skipped';
  let operational_state: CrmSubscriptionTimelineRow['operational_state'] = 'awaiting_generation';
  let status_pt = 'Prevista';
  if (hasInvoice) {
    operational_state = 'generated';
    status_pt = 'Pendente';
  } else if (failed) {
    operational_state = 'failed';
    status_pt = 'Falha na geração';
  } else if (skipped) {
    operational_state = 'skipped';
    status_pt = 'Sem nova fatura';
  }
  return {
    month_ref: due.slice(0, 7),
    cycle_label: due,
    cycle_subtitle: due,
    cycle_date: due,
    period_label: due,
    period_start: ps,
    period_end: pe,
    due_date: due,
    status_pt,
    operational_state,
    operational_state_pt: status_pt,
    amount_cents: detail.subscription.amount_cents,
    invoice_id: cycle.invoice_id,
    invoice_status: null,
    cycle_status: cycle.status,
    cycle_id: cycle.id,
    job_id: cycle.job_id,
    merge_source: 'cycle',
    cycle_skipped_reason: cycle.skipped_reason,
    processed_at: cycle.processed_at,
    gateway_status: null,
    generation_note: null,
    job_error_snippet: cycle.error_message,
  };
}

export function assertAllEventsHaveCycleId(
  events: Array<{ cycleId: string | null }>
): { valid: boolean; missing: number } {
  const missing = events.filter((e) => !e.cycleId?.trim()).length;
  return { valid: missing === 0, missing };
}
