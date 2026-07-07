import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';

function ymdHead(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/** Deriva `invoices[]` a partir da timeline (fixtures de teste — sem timeline no Aggregate). */
export function invoicesFromTimeline(
  timeline: CrmSubscriptionTimelineRow[],
  cycles: CrmSubscriptionDetailPayload['cycles_raw'],
  subscriptionAmountCents: number
): NonNullable<CrmSubscriptionDetailPayload['invoices']> {
  const out: NonNullable<CrmSubscriptionDetailPayload['invoices']> = [];
  const seen = new Set<string>();

  for (const row of timeline) {
    if (!row.invoice_id || seen.has(row.invoice_id)) continue;
    seen.add(row.invoice_id);
    const cycleMatch = cycles.find((c) => c.invoice_id === row.invoice_id);
    const due = ymdHead(row.due_date) ?? ymdHead(row.cycle_date) ?? '2026-07-14';
    const status = (row.invoice_status ?? 'pending').toLowerCase();
    out.push({
      id: row.invoice_id,
      subscription_cycle_id: cycleMatch?.id ?? row.cycle_id,
      amount_cents: row.amount_cents ?? subscriptionAmountCents,
      due_date: due,
      period_start: row.period_start,
      period_end: row.period_end,
      status,
      created_at: row.invoice_created_at ?? `${due}T10:00:00Z`,
      gateway_status: row.gateway_status,
      gateway_reference_id: row.gateway_reference_id,
      invoice_type:
        row.operational_state === 'manual_invoice' || row.merge_source === 'invoice_only'
          ? 'manual'
          : null,
      paid_at:
        status === 'paid'
          ? (row.processed_at ?? `${due}T12:00:00Z`)
          : null,
      refunded_at:
        status === 'refunded' || status === 'chargeback'
          ? (row.processed_at ?? `${due}T12:00:00Z`)
          : null,
    });
  }

  return out;
}

/** Deriva faturas faltantes a partir de `cycles_raw` (fixtures que só override cycles). */
export function supplementInvoicesFromCycles(
  invoices: NonNullable<CrmSubscriptionDetailPayload['invoices']>,
  cycles: CrmSubscriptionDetailPayload['cycles_raw'],
  subscriptionAmountCents: number
): NonNullable<CrmSubscriptionDetailPayload['invoices']> {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  for (const cycle of cycles) {
    if (!cycle.invoice_id || byId.has(cycle.invoice_id)) continue;
    const due = cycle.cycle_date;
    const status =
      cycle.status.toLowerCase() === 'paid'
        ? 'paid'
        : cycle.status.toLowerCase() === 'failed'
          ? 'gateway_failed'
          : 'pending';
    byId.set(cycle.invoice_id, {
      id: cycle.invoice_id,
      subscription_cycle_id: cycle.id,
      amount_cents: subscriptionAmountCents,
      due_date: due,
      period_start: cycle.period_start,
      period_end: cycle.period_end,
      status,
      created_at: `${due}T10:00:00Z`,
      gateway_status: status === 'gateway_failed' ? 'failed' : null,
      gateway_reference_id: null,
      invoice_type: null,
      paid_at: status === 'paid' ? (cycle.processed_at ?? `${due}T12:00:00Z`) : null,
      refunded_at: null,
    });
  }
  return [...byId.values()];
}

export function withInvoicesFromTimeline(
  detail: CrmSubscriptionDetailPayload,
  timeline?: CrmSubscriptionTimelineRow[]
): CrmSubscriptionDetailPayload {
  const tl = timeline ?? detail.timeline;
  const invoices = supplementInvoicesFromCycles(
    invoicesFromTimeline(tl, detail.cycles_raw, detail.subscription.amount_cents),
    detail.cycles_raw,
    detail.subscription.amount_cents
  );
  return { ...detail, invoices };
}
