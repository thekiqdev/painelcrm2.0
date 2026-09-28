import { formatCentsCompact } from '@/lib/billingAggregate/aggregateDateUtils';
import type { BillingAggregate } from '@/lib/billingAggregate';
import { formatEventDateShort } from '@/lib/financialEventHelpers';

export type SidebarSummaryView = {
  nextReceiptDate: string;
  nextReceiptAmount: string;
  lastPaymentDate: string;
  lastPaymentAmount: string;
  openAmount: string;
  annualRevenue: string;
  nextEventDate: string;
  nextEventTitle: string;
};

/** Sidebar direto do Aggregate.sidebar + subscription. */
export function buildSidebarSummaryFromAggregate(
  aggregate: BillingAggregate
): SidebarSummaryView {
  const sidebar = aggregate.sidebar;
  const next = aggregate.nextInvoice;
  const lastPayment = aggregate.events
    .filter((e) => e.kind === 'real' && e.eventType === 'payment')
    .sort((a, b) => b.dueYmd.localeCompare(a.dueYmd))[0];

  return {
    nextReceiptDate: sidebar.nextReceiptDate,
    nextReceiptAmount:
      next?.metadata.amount != null
        ? formatCentsCompact(next.metadata.amount)
        : formatCentsCompact(aggregate.subscription.amount),
    lastPaymentDate: sidebar.lastPaymentDate,
    lastPaymentAmount: lastPayment
      ? formatCentsCompact(lastPayment.metadata.amount ?? aggregate.subscription.amount)
      : '—',
    openAmount: sidebar.openAmount,
    annualRevenue: formatCentsCompact(aggregate.subscription.amount * 12),
    nextEventDate: next?.date ? formatEventDateShort(next.date) : '—',
    nextEventTitle: next?.isProjected ? 'Prevista' : 'Próxima cobrança',
  };
}
