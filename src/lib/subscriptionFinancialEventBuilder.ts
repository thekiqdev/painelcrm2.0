import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  buildFutureCycles,
  friendlyBillingMessage,
  normalizeYmdInput,
  resolveGenerationYmd,
} from './billingSubscriptionExperience';
import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import {
  badgeForEventType,
  cycleKeyFromParts,
  standardStatusLabel,
} from './financialEventHelpers';
import { isRecoverableCycleFailure } from './subscriptionRenewalRecovery';

function isPaid(row: CrmSubscriptionTimelineRow): boolean {
  return (row.invoice_status ?? '').toLowerCase() === 'paid' || row.operational_state === 'paid';
}

function isRefunded(row: CrmSubscriptionTimelineRow): boolean {
  const inv = (row.invoice_status ?? '').toLowerCase();
  return inv === 'refunded' || inv === 'chargeback';
}

function isOverdueDue(dueYmd: string | null, today: string): boolean {
  return Boolean(dueYmd && dueYmd < today);
}

function pushEvent(
  events: FinancialEvent[],
  seen: Set<string>,
  detail: CrmSubscriptionDetailPayload,
  today: string,
  payload: {
    id: string;
    type: FinancialEventType;
    ymd: string;
    dueYmd: string | null;
    amountCents: number | null;
    competence: string | null;
    invoiceId: string | null;
    cycleId: string | null;
    gateway: string | null;
    notes: string | null;
    paidAt: string | null;
    lastUpdatedAt: string | null;
  }
): void {
  if (seen.has(payload.id)) return;
  seen.add(payload.id);
  const overdue = payload.type === 'invoice_due' && isOverdueDue(payload.dueYmd, today);
  events.push({
    ...payload,
    cycleKey: cycleKeyFromParts(payload.cycleId, payload.dueYmd, payload.competence),
    statusLabel: standardStatusLabel(payload.type, overdue),
    statusBadge: badgeForEventType(payload.type, overdue),
    clientName: detail.client_name ?? null,
  });
}

/**
 * Única fonte de eventos financeiros da assinatura.
 * Pagamentos usam due_date como ymd para paridade com histórico.
 */
export function buildFinancialEvents(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEvent[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const events: FinancialEvent[] = [];
  const seen = new Set<string>();
  const timelineDueDates = new Set<string>();

  for (const row of detail.timeline) {
    if (row.merge_source === 'lifecycle') continue;
    const due = normalizeYmdInput(row.due_date);
    if (due) timelineDueDates.add(due);
    const competence = row.cycle_label || row.month_ref;
    const base = {
      dueYmd: due,
      amountCents: row.amount_cents,
      competence,
      invoiceId: row.invoice_id,
      cycleId: row.cycle_id,
      gateway: row.gateway_status ?? detail.subscription.gateway,
      notes: row.generation_note ?? row.job_error_snippet ?? null,
      paidAt: isPaid(row) ? normalizeYmdInput(row.processed_at?.slice(0, 10)) ?? due : null,
      lastUpdatedAt: row.processed_at ?? row.invoice_created_at ?? null,
    };

    if (isPaid(row) && due) {
      pushEvent(events, seen, detail, today, {
        id: `payment-${row.invoice_id ?? row.cycle_id}-${due}`,
        type: 'payment',
        ymd: due,
        ...base,
      });
    }

    if (isRefunded(row) && due) {
      pushEvent(events, seen, detail, today, {
        id: `refund-${row.invoice_id ?? row.cycle_id}-${due}`,
        type: 'invoice_refunded',
        ymd: due,
        ...base,
      });
    }

    if (
      (row.operational_state === 'cancelled' || row.operational_state === 'skipped') &&
      due &&
      !isPaid(row)
    ) {
      pushEvent(events, seen, detail, today, {
        id: `cancel-${row.cycle_id ?? row.invoice_id}-${due}`,
        type: 'invoice_cancelled',
        ymd: due,
        ...base,
      });
    }

    if (row.operational_state === 'failed' && !row.invoice_id) {
      if (detail.subscription.status === 'cancelled') continue;
      const failYmd =
        due ?? normalizeYmdInput(resolveGenerationYmd(due, detail.tenant_billing)) ?? today;
      if (isRecoverableCycleFailure(row, today)) {
        pushEvent(events, seen, detail, today, {
          id: `sched-${row.cycle_id ?? due}-${due ?? failYmd}`,
          type: 'upcoming_cycle',
          ymd: due ?? failYmd,
          dueYmd: due,
          amountCents: row.amount_cents,
          competence,
          invoiceId: null,
          cycleId: row.cycle_id,
          gateway: row.gateway_status ?? detail.subscription.gateway,
          notes: null,
          paidAt: null,
          lastUpdatedAt: row.processed_at ?? null,
        });
      } else {
        pushEvent(events, seen, detail, today, {
          id: `fail-${row.cycle_id ?? row.due_date}-${failYmd}`,
          type: 'invoice_failed',
          ymd: failYmd,
          dueYmd: due,
          amountCents: row.amount_cents,
          competence,
          invoiceId: null,
          cycleId: row.cycle_id,
          gateway: row.gateway_status ?? detail.subscription.gateway,
          notes: friendlyBillingMessage(row.job_error_snippet) || row.job_error_snippet,
          paidAt: null,
          lastUpdatedAt: row.processed_at ?? null,
        });
      }
    }

    if (row.operational_state === 'gateway_failed') {
      const failYmd = due ?? today;
      pushEvent(events, seen, detail, today, {
        id: `gwfail-${row.invoice_id ?? row.cycle_id}-${failYmd}`,
        type: 'invoice_failed',
        ymd: failYmd,
        ...base,
      });
    }

    if (row.has_auto_retry && due) {
      pushEvent(events, seen, detail, today, {
        id: `retry-${row.cycle_id}-${due}`,
        type: 'invoice_reprocessed',
        ymd: due,
        ...base,
      });
    }

    if (row.has_auto_retry && row.job_id) {
      const attemptYmd =
        normalizeYmdInput(row.job_retry_at?.slice(0, 10)) ?? due ?? today;
      pushEvent(events, seen, detail, today, {
        id: `attempt-${row.job_id}-${attemptYmd}`,
        type: 'charge_attempt',
        ymd: attemptYmd,
        ...base,
      });
    }

    if (row.operational_state === 'manual_invoice' && row.invoice_id) {
      const ymd = normalizeYmdInput(row.invoice_created_at?.slice(0, 10)) ?? due ?? today;
      pushEvent(events, seen, detail, today, {
        id: `manual-${row.invoice_id}-${ymd}`,
        type: 'manual_charge',
        ymd,
        ...base,
      });
    }

    if (row.invoice_id && row.invoice_created_at && !isPaid(row) && !isRefunded(row)) {
      const invYmd = normalizeYmdInput(row.invoice_created_at.slice(0, 10));
      if (invYmd && invYmd !== due) {
        pushEvent(events, seen, detail, today, {
          id: `gen-${row.invoice_id}-${invYmd}`,
          type: 'invoice_generated',
          ymd: invYmd,
          ...base,
        });
      }
    }

    if (row.invoice_id && due && !isPaid(row) && !isRefunded(row)) {
      pushEvent(events, seen, detail, today, {
        id: `due-${row.invoice_id}-${due}`,
        type: 'invoice_due',
        ymd: due,
        ...base,
      });
    }

    if (
      !row.invoice_id &&
      due &&
      row.operational_state !== 'failed' &&
      !isRecoverableCycleFailure(row, today) &&
      !isPaid(row) &&
      detail.subscription.status !== 'cancelled'
    ) {
      const isFuture = due >= today;
      if (
        isFuture ||
        row.operational_state === 'awaiting_generation' ||
        row.operational_state === 'scheduled'
      ) {
        pushEvent(events, seen, detail, today, {
          id: `sched-${row.cycle_id ?? due}-${due}`,
          type: 'upcoming_cycle',
          ymd: due,
          invoiceId: null,
          ...base,
        });
      }
    }
  }

  if (detail.subscription.status !== 'cancelled') {
    for (const cycle of buildFutureCycles(detail, 12)) {
      if (timelineDueDates.has(cycle.dueYmd)) continue;
      pushEvent(events, seen, detail, today, {
        id: `upcoming-${cycle.dueYmd}`,
        type: 'upcoming_cycle',
        ymd: cycle.dueYmd,
        dueYmd: cycle.dueYmd,
        amountCents: cycle.projectedAmountCents,
        competence: cycle.competence,
        invoiceId: null,
        cycleId: null,
        gateway: null,
        notes: null,
        paidAt: null,
        lastUpdatedAt: null,
      });
    }
  }

  return events.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.id.localeCompare(b.id));
}
