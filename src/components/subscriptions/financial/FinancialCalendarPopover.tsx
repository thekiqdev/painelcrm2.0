import type { FinancialEvent } from '@/lib/financialEventTypes';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { pickCalendarPopoverEvent, sortEventsByPriority } from '@/lib/financialEventHelpers';
import { formatFinancialAmount } from './financialFormat';
import { InvoiceDirectActions } from './InvoiceDirectActions';
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import { invoiceStatusFromEventType } from '@/lib/invoiceAvailableActions';
import { useFinancialEventStore, useFinancialTimeZone, usePaymentConfirmedHandler } from './FinancialEventStoreContext';
import type { GenerateBillingTarget } from '@/lib/subscriptionBillingGeneration';
import { ProjectedCompetenceNotice } from './ProjectedCompetenceNotice';
import { CycleInvariantRepairAction } from './CycleInvariantRepairAction';

type Props = {
  events: FinancialEvent[];
  detail: CrmSubscriptionDetailPayload;
  canViewInvoices?: boolean;
  onGenerateBilling?: (target?: GenerateBillingTarget) => void;
  onRepairCycleInvariant?: (row?: { cycleId?: string | null; id?: string }) => void;
  canRepairCycle?: boolean;
  repairingCycleId?: string | null;
  onChangeDue?: () => void;
  onViewHistory?: () => void;
};

export function FinancialCalendarPopover({
  events,
  detail,
  canViewInvoices = true,
  onGenerateBilling,
  onRepairCycleInvariant,
  canRepairCycle = true,
  repairingCycleId = null,
  onChangeDue,
  onViewHistory,
}: Props) {
  const store = useFinancialEventStore();
  const timeZone = useFinancialTimeZone();
  const onPaymentConfirmed = usePaymentConfirmedHandler();
  const ev = pickCalendarPopoverEvent(sortEventsByPriority(events));
  if (!ev) return null;

  const resolved = store.resolveCyclePresentation(ev.cycleId, 'CALENDAR', {
    eventType: ev.type,
    overdue: ev.type === 'invoice_due' && Boolean(ev.dueYmd && ev.dueYmd < store.today),
  });
  const showProjectionNotice = resolved.isProjected;
  const showInvariantRepair = resolved.needsInvariantRepair && Boolean(ev.cycleId);
  const showBillingActions =
    showInvariantRepair ||
    resolved.canGenerate ||
    resolved.canOpen ||
    resolved.canReprocess ||
    Boolean(ev.invoiceId);

  const amountLabel = ev.amountCents != null ? formatFinancialAmount(ev.amountCents) : '—';
  const dueLabel = ev.dueYmd ? formatYmdBrSafe(ev.dueYmd) : formatYmdBrSafe(ev.ymd);

  const actionHandlers = showBillingActions
    ? {
        onGenerateBilling: () => {
          if (!ev.cycleId?.trim()) return;
          onGenerateBilling?.({
            cycleId: ev.cycleId!,
            dueYmd: ev.dueYmd ?? ev.ymd,
            componentName: 'FinancialCalendarPopover',
          });
        },
        onChangeDue,
        onViewHistory,
      }
    : undefined;

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
          <dd className="text-right font-medium">{resolved.statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Data de vencimento</dt>
          <dd className="text-right font-medium">{dueLabel}</dd>
        </div>
      </dl>

      {showProjectionNotice ? (
        <ProjectedCompetenceNotice ev={ev} />
      ) : showInvariantRepair ? (
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Competência inconsistente — corrija para permitir gerar novamente.
          </p>
          <CycleInvariantRepairAction
            cycleId={ev.cycleId}
            loading={repairingCycleId === (ev.cycleId ?? ev.id)}
            disabled={!canRepairCycle}
            onRepair={() =>
              onRepairCycleInvariant?.({ cycleId: ev.cycleId, id: ev.cycleId ?? ev.id })
            }
          />
        </div>
      ) : showBillingActions ? (
        <div className="border-t pt-3">
          <InvoiceDirectActions
            invoiceId={ev.invoiceId}
            canViewInvoices={canViewInvoices}
            eventType={ev.type}
            invoiceStatus={invoiceStatusFromEventType(ev.type)}
            gateway={ev.gateway}
            cycleId={ev.cycleId}
            amountCents={ev.amountCents}
            dueYmd={ev.dueYmd ?? ev.ymd}
            handlers={actionHandlers}
            timeZone={timeZone}
            onPaymentConfirmed={onPaymentConfirmed}
            cycleResolved={resolved}
          />
        </div>
      ) : null}
    </div>
  );
}
