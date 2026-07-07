/**
 * Resolver canônico da próxima cobrança elegível (Sprint 5.0-23B — OCRE).
 */
import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';
import { cycleDueYmd } from './subscriptionRenewalRecovery';
import { timelineRowForCycle, listCyclesFromDetail } from './subscriptionCyclesSource';
import { resolveOperationalCompetency } from './operationalCompetencyResolver';

export type NextInvoiceCandidateSource = 'timeline' | 'cycles_raw';

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
    periodStart: row.period_start ?? dueYmd,
    periodEnd: row.period_end,
    amountCents: row.amount_cents ?? detail.subscription.amount_cents,
    invoiceId,
    hasInvoice: Boolean(invoiceId),
  };
}

/** Primeiro ciclo elegível via OCRE (sem projeção). */
export function getNextAwaitingGenerationCycle(
  detail: CrmSubscriptionDetailPayload,
  _todayYmd?: string
): CrmSubscriptionTimelineRow | null {
  if (detail.subscription.status === 'cancelled') return null;
  const resolved = resolveOperationalCompetency(detail, { mode: 'NEXT_CARD' });
  if (!resolved.cycleId) return null;
  const cycle = detail.cycles_raw?.find((c) => c.id === resolved.cycleId);
  if (!cycle) return null;
  return timelineRowForCycle(detail, cycle);
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
  const resolved = resolveOperationalCompetency(detail, { mode: 'NEXT_CARD' });
  const cycle = resolved.cycleId
    ? detail.cycles_raw?.find((c) => c.id === resolved.cycleId)
    : null;
  if (!cycle) return null;
  const row = timelineRowForCycle(detail, cycle);
  if (!row) return null;
  const due = cycleDueYmd(row);
  if (!due) return null;
  const fromTimeline = detail.timeline.some((r) => r.cycle_id === cycle.id);
  const source: NextInvoiceCandidateSource = fromTimeline ? 'timeline' : 'cycles_raw';
  return toCandidate(row, source, detail);
}

/** Total de ciclos sem invoice elegíveis (auditoria). */
export function countUninvoicedEligibleCycles(detail: CrmSubscriptionDetailPayload): number {
  const resolved = resolveOperationalCompetency(detail, { mode: 'NEXT_GENERATE' });
  return resolved.canGenerate ? 1 : 0;
}
