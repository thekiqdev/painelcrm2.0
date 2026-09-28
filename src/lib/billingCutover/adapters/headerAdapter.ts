import type { BillingAggregate } from '@/lib/billingAggregate';
import { intervalLabel } from '@/components/subscriptions/subscriptionsListUtils';
import type { FinancialHeaderData } from '@/lib/subscriptionFinancialExperience';
import { formatCentsCompact } from '@/lib/billingAggregate/aggregateDateUtils';
import { formatEventAmount } from '@/lib/financialEventHelpers';

const STATUS_EMOJI: Record<string, string> = {
  active: '🟢',
  paused: '⏸️',
  cancelled: '⚫',
  expired: '⚫',
  pending: '⚪',
  trialing: '🔵',
};

function subscriptionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Ativa',
    paused: 'Pausada',
    cancelled: 'Cancelada',
    expired: 'Expirada',
    pending: 'Pendente',
    trialing: 'Trial',
  };
  return map[status] ?? status;
}

/** Header a partir de aggregate.sidebar + aggregate.subscription. */
export function buildHeaderDataFromAggregate(
  aggregate: BillingAggregate,
  clientName: string | null | undefined,
  planName: string | null | undefined
): FinancialHeaderData {
  const sub = aggregate.subscription;
  const sidebar = aggregate.sidebar;
  const lastPayment = aggregate.events
    .filter((e) => e.kind === 'real' && e.eventType === 'payment')
    .sort((a, b) => b.dueYmd.localeCompare(a.dueYmd))[0];

  const progressPct = sub.metadata.maxCycles
    ? Math.min(
        100,
        Math.round(
          (aggregate.history.filter((h) => h.type === 'payment').length /
            (sub.metadata.maxCycles || 1)) *
            100
        )
      )
    : 0;

  return {
    clientName: clientName?.trim() || 'Cliente',
    planName: planName?.trim() || intervalLabel(sub.billingInterval),
    amountLabel: formatEventAmount(sub.amount),
    statusLabel: subscriptionStatusLabel(sub.status),
    statusEmoji: STATUS_EMOJI[sub.status] ?? '⚪',
    lastPaymentLabel: sidebar.lastPaymentDate,
    lastPaymentAmount: lastPayment
      ? formatCentsCompact(lastPayment.metadata.amount ?? sub.amount)
      : null,
    nextReceiptLabel: sidebar.nextReceiptDate,
    nextReceiptAmount:
      aggregate.nextInvoice?.metadata.amount != null
        ? formatCentsCompact(aggregate.nextInvoice.metadata.amount)
        : formatCentsCompact(sub.amount),
    annualForecastLabel: formatCentsCompact(sub.amount * 12),
    progressPct,
    progressLabel: sub.metadata.maxCycles
      ? `${aggregate.history.filter((h) => h.type === 'payment').length} / ${sub.metadata.maxCycles} ciclos`
      : 'Recorrente',
  };
}
