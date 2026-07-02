import type { FinancialEvent } from '@/lib/financialEventTypes';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { pickPrimaryEvent, sortEventsByPriority } from '@/lib/financialEventHelpers';
import { formatFinancialAmount } from './financialFormat';
import { InvoiceDirectActions } from './InvoiceDirectActions';
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import { invoiceStatusFromEventType } from '@/lib/invoiceAvailableActions';
import { useFinancialTimeZone, usePaymentConfirmedHandler } from './FinancialEventStoreContext';

type Props = {
  events: FinancialEvent[];
  detail: CrmSubscriptionDetailPayload;
  canViewInvoices?: boolean;
  onGenerateBilling?: () => void;
  onChangeDue?: () => void;
  onViewHistory?: () => void;
};

export function FinancialCalendarPopover({
  events,
  detail,
  canViewInvoices = true,
  onGenerateBilling,
  onChangeDue,
  onViewHistory,
}: Props) {
  const timeZone = useFinancialTimeZone();
  const onPaymentConfirmed = usePaymentConfirmedHandler();
  const sorted = sortEventsByPriority(events);
  const ev = pickPrimaryEvent(sorted);
  if (!ev) return null;

  const amountLabel = ev.amountCents != null ? formatFinancialAmount(ev.amountCents) : '—';
  const dueLabel = ev.dueYmd ? formatYmdBrSafe(ev.dueYmd) : formatYmdBrSafe(ev.ymd);

  const actionHandlers = {
    onGenerateBilling,
    onChangeDue,
    onViewHistory,
  };

  return (
    <div className="space-y-4 text-sm" data-focus-trap-root>
      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Competência</dt>
          <dd className="text-right font-medium truncate max-w-[55%]">{ev.competence ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Valor</dt>
          <dd className="text-right font-medium tabular-nums">{amountLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Status</dt>
          <dd className="text-right font-medium">{ev.statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Data de vencimento</dt>
          <dd className="text-right font-medium">{dueLabel}</dd>
        </div>
      </dl>

      <div className="border-t pt-3">
        <InvoiceDirectActions
          invoiceId={ev.invoiceId}
          canViewInvoices={canViewInvoices}
          eventType={ev.type}
          invoiceStatus={invoiceStatusFromEventType(ev.type)}
          gateway={ev.gateway}
          amountCents={ev.amountCents}
          dueYmd={ev.dueYmd ?? ev.ymd}
          handlers={actionHandlers}
          timeZone={timeZone}
          onPaymentConfirmed={onPaymentConfirmed}
        />
      </div>
    </div>
  );
}
