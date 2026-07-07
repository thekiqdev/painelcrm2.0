/**
 * Sprint 4.2H — Camada de projeção UX-only.
 * Nunca gera cobrança, nunca possui cycle_id, nunca altera Billing Runtime.
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialEvent } from './financialEventTypes';
import {
  advanceBillingDueYmd,
  buildFutureCycles,
  normalizeYmdInput,
} from './billingSubscriptionExperience';
import { badgeForEventType, cycleKeyFromParts } from './financialEventHelpers';
import { listCyclesFromDetail } from './subscriptionCyclesSource';

export const PROJECTION_MAX_COUNT = 12;

export function isProjectedFinancialEvent(ev: FinancialEvent): boolean {
  return ev.kind === 'projected';
}

export function isRealFinancialEvent(ev: FinancialEvent): boolean {
  return ev.kind !== 'projected';
}

/** Datas já ocupadas por subscription_cycles (cycle_date). */
export function occupiedDueDatesFromDetail(detail: CrmSubscriptionDetailPayload): Set<string> {
  const dates = new Set<string>();
  for (const cycle of listCyclesFromDetail(detail)) {
    const d = normalizeYmdInput(cycle.cycle_date);
    if (d) dates.add(d);
  }
  return dates;
}

/**
 * Projeta competências futuras a partir de next_billing_date + advanceBillingDueYmd.
 * Nunca atribui cycle_id nem invoice_id.
 */
export function buildProjectionEvents(
  detail: CrmSubscriptionDetailPayload,
  _todayYmd: string,
  count = PROJECTION_MAX_COUNT
): FinancialEvent[] {
  if (detail.subscription.status === 'cancelled') return [];
  const occupied = occupiedDueDatesFromDetail(detail);
  const raw = buildFutureCycles(detail, count + occupied.size);
  const events: FinancialEvent[] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    const due = normalizeYmdInput(row.dueYmd);
    if (!due || occupied.has(due) || seen.has(due)) continue;
    if (events.length >= count) break;
    seen.add(due);

    const statusLabel = row.projectedStatusPt === 'Pausada' ? 'Pausada' : 'Prevista';
    events.push({
      id: `projected-${due}`,
      kind: 'projected',
      type: 'upcoming_cycle',
      ymd: due,
      dueYmd: due,
      amountCents: row.projectedAmountCents,
      competence: row.competence,
      invoiceId: null,
      cycleId: null,
      statusLabel,
      statusBadge: badgeForEventType('upcoming_cycle'),
      gateway: detail.subscription.gateway,
      notes: null,
      paidAt: null,
      clientName: detail.client_name ?? null,
      lastUpdatedAt: null,
      cycleKey: cycleKeyFromParts(null, due, row.competence),
    });
  }
  return events;
}

/** Mescla eventos reais + projeções; reais sempre têm prioridade por data. */
export function mergeRealAndProjectionEvents(
  realEvents: FinancialEvent[],
  projectionEvents: FinancialEvent[]
): FinancialEvent[] {
  const realDueDates = new Set(
    realEvents.map((e) => normalizeYmdInput(e.dueYmd) ?? normalizeYmdInput(e.ymd)).filter(Boolean) as string[]
  );
  const filtered = projectionEvents.filter((p) => {
    const due = normalizeYmdInput(p.dueYmd) ?? normalizeYmdInput(p.ymd);
    return due && !realDueDates.has(due);
  });
  return [...realEvents, ...filtered].sort(
    (a, b) => a.ymd.localeCompare(b.ymd) || a.id.localeCompare(b.id)
  );
}

/** Primeira projeção futura (para Next Invoice / Sidebar quando não há ciclo real). */
export function resolveFirstProjectedEvent(
  displayEvents: FinancialEvent[],
  todayYmd: string
): FinancialEvent | null {
  return (
    displayEvents
      .filter(isProjectedFinancialEvent)
      .filter((e) => {
        const due = e.dueYmd ?? e.ymd;
        return due >= todayYmd;
      })
      .sort((a, b) => (a.dueYmd ?? a.ymd).localeCompare(b.dueYmd ?? b.ymd))[0] ?? null
  );
}

/** Período estimado para exibição de competência projetada. */
export function projectedPeriodEnd(
  dueYmd: string,
  billingInterval: CrmSubscriptionDetailPayload['subscription']['billing_interval']
): string {
  return advanceBillingDueYmd(dueYmd, billingInterval);
}
