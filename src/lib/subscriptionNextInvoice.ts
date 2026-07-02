import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { normalizeYmdInput } from './billingSubscriptionExperience';
import { formatYmdBrSafe } from './billingSafeDate';
import { formatEventAmount, formatEventDateShort } from './financialEventHelpers';
import {
  buildWorkerHistoryEntries,
  cycleDueYmd,
  isRecoverableCycleFailure,
  type WorkerHistoryEntry,
} from './subscriptionRenewalRecovery';
import {
  buildSubscriptionFinancialEvents,
  resolveNextChargeEvent,
  resolveNextChargePresentation,
} from './subscriptionFinancialEvents';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type NextInvoiceAction = 'generate' | 'open';

export type NextInvoiceExperience = {
  dueYmd: string | null;
  dateLabel: string;
  dateLabelShort: string;
  amountCents: number;
  amountLabel: string;
  competenceLabel: string;
  statusKey: 'pending' | 'issued' | 'paid' | 'cancelled' | 'paused';
  statusLabel: string;
  invoiceId: string | null;
  invoiceDisplayRef: string | null;
  hasInvoice: boolean;
  action: NextInvoiceAction;
  actionLabel: string;
  isRecoverableFailure: boolean;
  workerHistory: WorkerHistoryEntry[];
  visible: boolean;
};

export function formatNextInvoiceDateLong(ymd: string): string {
  const day = Number(ymd.slice(8, 10));
  const mi = Number(ymd.slice(5, 7)) - 1;
  const year = ymd.slice(0, 4);
  if (mi < 0 || mi >= 12) return ymd;
  return `${day} ${MONTH_SHORT[mi]} ${year}`;
}

export function formatCompetenceRange(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  dueYmd: string | null
): string {
  const ps = normalizeYmdInput(periodStart) ?? dueYmd;
  const pe = normalizeYmdInput(periodEnd);
  if (ps && pe) return `${formatYmdBrSafe(ps).slice(0, 5)} → ${formatYmdBrSafe(pe).slice(0, 5)}`;
  if (ps) return formatYmdBrSafe(ps);
  return '—';
}

/** Próxima cobrança — delega à coleção unificada `subscriptionFinancialEvents`. */
export function resolveNextInvoiceExperience(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): NextInvoiceExperience {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const events = buildSubscriptionFinancialEvents(detail, today);
  const presentation = resolveNextChargePresentation(detail, events, today);
  const nextEv = resolveNextChargeEvent(events, today);
  const recoverable =
    Boolean(nextEv) &&
    detail.timeline.some(
      (r) =>
        cycleDueYmd(r) === (nextEv?.dueYmd ?? '') &&
        isRecoverableCycleFailure(r, today)
    );

  return {
    ...presentation,
    isRecoverableFailure: recoverable,
    workerHistory: buildWorkerHistoryEntries(detail),
  };
}
