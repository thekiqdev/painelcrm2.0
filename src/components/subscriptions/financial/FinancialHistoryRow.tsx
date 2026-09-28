import type { FinancialHistoryRow as HistoryRow } from '@/lib/billingSubscriptionExperience';
import { badgeVariantFromHistoryStatus } from '@/lib/financialStatusBadge';
import { formatFinancialAmount } from './financialFormat';
import { formatHistoryCompetence } from '@/lib/subscriptionFinancialOverview';
import { historyStatusDisplayLabel, capabilitiesInputFromHistoryRow } from '@/lib/subscriptionActionExperience';
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import { PaymentBadge } from './FinancialStatCard';
import { InvoiceDirectActions } from './InvoiceDirectActions';
import { HistoryRowChargeAction } from './HistoryRowChargeAction';
import { CycleInvariantRepairAction } from './CycleInvariantRepairAction';
import { useFinancialTimeZone, usePaymentConfirmedHandler } from './FinancialEventStoreContext';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  row: HistoryRow;
  canViewInvoices?: boolean;
  generatingRowId?: string | null;
  repairingRowId?: string | null;
  onGenerateBilling?: (row: HistoryRow) => void;
  onRepairCycleInvariant?: (row: HistoryRow) => void;
  canRepairCycle?: boolean;
  variant: 'table' | 'card';
};

export function FinancialHistoryRow({
  row,
  canViewInvoices = true,
  generatingRowId = null,
  repairingRowId = null,
  onGenerateBilling,
  onRepairCycleInvariant,
  canRepairCycle = true,
  variant,
}: Props) {
  const timeZone = useFinancialTimeZone();
  const onPaymentConfirmed = usePaymentConfirmedHandler();
  const badgeVariant = badgeVariantFromHistoryStatus(row.visual, row.statusPt, row.invoiceId);
  const statusLabel = historyStatusDisplayLabel(row);
  const loading = generatingRowId === row.id;
  const repairing = repairingRowId === row.id;
  const repairAction = row.needsInvariantRepair ? (
    <CycleInvariantRepairAction
      cycleId={row.cycleId}
      loading={repairing}
      disabled={!canRepairCycle}
      onRepair={() => onRepairCycleInvariant?.(row)}
    />
  ) : null;
  const chargeAction = row.canGenerateNow ? (
    <HistoryRowChargeAction row={row} loading={loading} onGenerate={onGenerateBilling} />
  ) : null;
  const nextBadge = row.isNextCharge ? (
    <Badge variant="secondary" className="text-[10px] font-medium shrink-0">
      Próxima cobrança
    </Badge>
  ) : null;
  const projectedBadge = row.isProjected ? (
    <Badge variant="outline" className="text-[10px] font-medium shrink-0 text-muted-foreground">
      Prevista
    </Badge>
  ) : null;
  const rowHighlight = row.isNextCharge ? 'bg-primary/5 border-l-2 border-l-primary' : '';
  const invoiceActionsInput = capabilitiesInputFromHistoryRow(row, canViewInvoices);

  if (variant === 'card') {
    return (
      <article className={cn('rounded-lg border p-2.5 space-y-1.5 bg-card', rowHighlight)}>
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium text-sm">{formatHistoryCompetence(row)}</p>
            {nextBadge}
            {projectedBadge}
          </div>
          <PaymentBadge label={statusLabel} variant={badgeVariant} />
        </div>
        <p className="text-base font-bold tabular-nums">
          {row.amountCents != null ? formatFinancialAmount(row.amountCents) : '—'}
        </p>
        <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground">
          <span>Venc. {formatYmdBrSafe(row.dueYmd)}</span>
          {row.paidAt ? <span>Pago {formatYmdBrSafe(row.paidAt)}</span> : null}
          <div className="flex items-center gap-2 ml-auto">
            {repairAction}
            {chargeAction}
            {row.invoiceId ? (
              <InvoiceDirectActions
                invoiceId={row.invoiceId}
                canViewInvoices={canViewInvoices}
                eventType={invoiceActionsInput.eventType}
                invoiceStatus={invoiceActionsInput.invoiceStatus}
                gateway={row.gateway}
                amountCents={row.amountCents}
                dueYmd={row.dueYmd}
                timeZone={timeZone}
                onPaymentConfirmed={onPaymentConfirmed}
              />
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <TableRow className={cn('hover:bg-muted/30 h-9', rowHighlight)}>
      <TableCell className="font-medium text-sm max-w-[160px] py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{formatHistoryCompetence(row)}</span>
          {nextBadge}
          {projectedBadge}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm whitespace-nowrap py-1.5">
        {row.amountCents != null ? formatFinancialAmount(row.amountCents) : '—'}
      </TableCell>
      <TableCell className="text-sm tabular-nums whitespace-nowrap py-1.5">
        {formatYmdBrSafe(row.dueYmd)}
      </TableCell>
      <TableCell className="text-sm tabular-nums whitespace-nowrap py-1.5">
        {formatYmdBrSafe(row.paidAt)}
      </TableCell>
      <TableCell className="py-1.5">
        <PaymentBadge label={statusLabel} variant={badgeVariant} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap py-1.5">
        <div className="inline-flex items-center justify-end gap-1">
          {repairAction}
          {chargeAction}
          {row.invoiceId ? (
            <InvoiceDirectActions
              invoiceId={row.invoiceId}
              canViewInvoices={canViewInvoices}
              eventType={invoiceActionsInput.eventType}
              invoiceStatus={invoiceActionsInput.invoiceStatus}
              gateway={row.gateway}
              amountCents={row.amountCents}
              dueYmd={row.dueYmd}
              timeZone={timeZone}
              onPaymentConfirmed={onPaymentConfirmed}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
