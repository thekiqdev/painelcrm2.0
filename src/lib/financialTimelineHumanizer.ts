import type { FinancialEventType } from './financialEventTypes';
import type { FinancialTimelineItem } from './subscriptionFinancialExperience';
import { formatEventAmount, formatEventDateShort } from './financialEventHelpers';

export type HumanTimelineCopy = {
  title: string;
  amountLine: string | null;
  dateLine: string;
  actionLabel: string | null;
  emoji: string;
};

export function humanizeTimelineEventType(
  type: FinancialEventType,
  ymd: string,
  today: string,
  amountCents: number | null
): HumanTimelineCopy {
  const amountLine = amountCents != null ? formatEventAmount(amountCents) : null;
  const dateLine = formatEventDateShort(ymd);

  switch (type) {
    case 'payment':
      return { title: 'Cliente pagou', amountLine, dateLine, actionLabel: null, emoji: '💰' };
    case 'upcoming_cycle':
      return {
        title: 'Você deverá receber',
        amountLine,
        dateLine,
        actionLabel: null,
        emoji: '📅',
      };
    case 'invoice_due':
      return {
        title: ymd < today ? 'Pagamento em atraso' : 'Você deverá receber',
        amountLine,
        dateLine,
        actionLabel: ymd < today ? 'Resolver agora' : null,
        emoji: ymd < today ? '⚠' : '📅',
      };
    case 'invoice_failed':
    case 'charge_attempt':
      return {
        title: 'Cobrança não foi criada',
        amountLine,
        dateLine,
        actionLabel: 'Resolver agora',
        emoji: '⚠',
      };
    case 'invoice_generated':
    case 'manual_charge':
      return {
        title: 'Cobrança será gerada',
        amountLine,
        dateLine,
        actionLabel: null,
        emoji: '🔵',
      };
    case 'invoice_reprocessed':
      return { title: 'Cobrança reprocessada', amountLine, dateLine, actionLabel: null, emoji: '🔄' };
    case 'invoice_cancelled':
      return { title: 'Cobrança cancelada', amountLine, dateLine, actionLabel: null, emoji: '⚫' };
    case 'invoice_refunded':
      return { title: 'Pagamento reembolsado', amountLine, dateLine, actionLabel: null, emoji: '⚫' };
    default:
      return { title: 'Movimentação financeira', amountLine, dateLine, actionLabel: null, emoji: '🧾' };
  }
}

export function humanizeTimelineItem(
  item: FinancialTimelineItem,
  today: string
): HumanTimelineCopy {
  if (item.eventType) {
    return humanizeTimelineEventType(item.eventType, item.ymd, today, item.amountCents);
  }
  if (item.icon === '💰') {
    return {
      title: 'Cliente pagou',
      amountLine: item.amountCents != null ? formatEventAmount(item.amountCents) : null,
      dateLine: item.dateLabel,
      actionLabel: null,
      emoji: '💰',
    };
  }
  return {
    title: item.title,
    amountLine: item.amountCents != null ? formatEventAmount(item.amountCents) : null,
    dateLine: item.dateLabel,
    actionLabel: null,
    emoji: item.icon,
  };
}

export function humanMonthSummaryTitle(paidCount: number, totalCents: number): string {
  if (paidCount > 0) return `Recebeu ${formatEventAmount(totalCents)}`;
  return 'Movimentação do mês';
}
