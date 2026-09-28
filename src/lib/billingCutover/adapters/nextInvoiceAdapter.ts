import type { BillingAggregate } from '@/lib/billingAggregate';
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import { formatEventAmount, formatEventDateShort } from '@/lib/financialEventHelpers';
import type { NextChargePresentation } from '@/lib/subscriptionFinancialEvents';
import { formatCompetenceRange, formatNextInvoiceDateLong } from '@/lib/subscriptionNextInvoice';
import { mapAggregateEventType } from './eventTypeMap';

/** NextInvoice direto do Aggregate.nextInvoice — sem timeline. */
export function buildNextChargePresentationFromAggregate(
  aggregate: BillingAggregate
): NextChargePresentation {
  const next = aggregate.nextInvoice;
  const status = aggregate.subscription.status;
  const cancelled = status === 'cancelled';
  const paused = status === 'paused';

  if (!next || !next.date) {
    return {
      eventId: null,
      eventType: null,
      cycleId: null,
      isProjected: false,
      dueYmd: null,
      dateLabel: '—',
      dateLabelShort: '—',
      amountCents: aggregate.subscription.amount,
      amountLabel: formatEventAmount(aggregate.subscription.amount),
      competenceLabel: '—',
      statusKey: cancelled ? 'cancelled' : 'pending',
      statusLabel: cancelled ? 'Cancelada' : '—',
      invoiceId: null,
      invoiceDisplayRef: null,
      hasInvoice: false,
      action: 'generate',
      actionLabel: 'Gerar cobrança',
      isRecoverableFailure: false,
      workerHistory: [],
      visible: !cancelled,
    };
  }

  const hasInvoice = Boolean(next.metadata.invoiceId);
  const isProjected = next.isProjected;
  const legacyType = next.eventType ? mapAggregateEventType(next.eventType) : null;

  let statusKey: NextChargePresentation['statusKey'] = 'pending';
  let statusLabel = 'Prevista';
  if (paused) {
    statusKey = 'paused';
    statusLabel = 'Pausada';
  } else if (cancelled) {
    statusKey = 'cancelled';
    statusLabel = 'Cancelada';
  } else if (hasInvoice) {
    statusKey = 'issued';
    statusLabel = 'Pendente';
  } else if (isProjected) {
    statusKey = 'pending';
    statusLabel = 'Prevista';
  }

  const amountCents = next.metadata.amount ?? aggregate.subscription.amount;
  const invoiceId = next.metadata.invoiceId;

  return {
    eventId: next.eventId,
    eventType: legacyType,
    cycleId: isProjected ? null : next.cycleId,
    isProjected,
    dueYmd: next.date,
    dateLabel: formatNextInvoiceDateLong(next.date),
    dateLabelShort: formatEventDateShort(next.date),
    amountCents,
    amountLabel: formatEventAmount(amountCents),
    competenceLabel: formatCompetenceRange(
      isProjected ? next.date : next.metadata.periodStart,
      next.metadata.periodEnd,
      next.date
    ),
    statusKey,
    statusLabel,
    invoiceId,
    invoiceDisplayRef: invoiceId
      ? `#${invoiceId.replace(/-/g, '').slice(-4).toUpperCase()}`
      : null,
    hasInvoice,
    action: isProjected ? 'generate' : hasInvoice ? 'open' : 'generate',
    actionLabel: isProjected ? 'Previsão' : hasInvoice ? 'Abrir cobrança' : 'Gerar cobrança',
    isRecoverableFailure: false,
    workerHistory: [],
    visible: !cancelled || Boolean(next.date),
  };
}
