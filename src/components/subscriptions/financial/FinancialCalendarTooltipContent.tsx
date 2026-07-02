import type { FinancialEvent } from '@/lib/financialEventTypes';
import { formatFinancialAmount } from './financialFormat';
import { formatYmdBrSafe, formatDateTimeBrSafe } from '@/lib/billingSafeDate';
import { Button } from '@/components/ui/button';
import { copyInvoicePublicUrl, openInvoiceInNewTab } from '@/lib/invoiceQuickActions';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';

type Props = {
  events: FinancialEvent[];
  clientName: string | null;
};

export function FinancialCalendarTooltipContent({ events, clientName }: Props) {
  const ev = events[0];
  if (!ev) return null;

  const amountLabel = ev.amountCents != null ? formatFinancialAmount(ev.amountCents) : '—';

  return (
    <div className="space-y-2 text-xs max-w-[220px]">
      <p className="font-semibold">{formatYmdBrSafe(ev.ymd)}</p>
      <dl className="grid gap-1">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="font-medium truncate max-w-[55%] text-right">{clientName ?? ev.clientName ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Competência</dt>
          <dd className="font-medium">{ev.competence ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="font-medium tabular-nums">{amountLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">{ev.statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Gateway</dt>
          <dd className="font-medium">{ev.gateway ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Atualização</dt>
          <dd className="font-medium text-[10px]">
            {ev.lastUpdatedAt ? formatDateTimeBrSafe(ev.lastUpdatedAt) : formatYmdBrSafe(ev.ymd)}
          </dd>
        </div>
      </dl>
      {ev.invoiceId ? (
        <div className="flex flex-wrap gap-1 pt-1 border-t">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn('h-7 text-[10px] px-2', focusRingClass())}
            onClick={(e) => {
              e.stopPropagation();
              openInvoiceInNewTab(ev.invoiceId!);
            }}
          >
            Abrir cobrança
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn('h-7 text-[10px] px-2', focusRingClass())}
            onClick={(e) => {
              e.stopPropagation();
              void copyInvoicePublicUrl(ev.invoiceId!);
            }}
          >
            Copiar link
          </Button>
        </div>
      ) : null}
    </div>
  );
}
