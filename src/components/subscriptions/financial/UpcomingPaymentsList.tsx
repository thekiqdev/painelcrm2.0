import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import {
  sliceUpcomingReceipts,
  upcomingExpandLabel,
  shouldUseUpcomingInternalScroll,
  upcomingListMaxHeightPx,
} from '@/lib/subscriptionFinancialRefinement';
import { formatFinancialAmount } from './financialFormat';
import { PaymentBadge } from './FinancialStatCard';
import { InvoiceQuickActions } from './InvoiceQuickActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ChevronDown, Zap } from 'lucide-react';
import { focusRingClass } from './FinancialStatCard';
import type { FinancialBadgeVariant } from '@/lib/financialStatusBadge';

type Props = {
  canViewInvoices?: boolean;
  onGenerateBilling?: () => void;
  onChangeDue?: () => void;
  className?: string;
};

function ReceiptItem({
  dateLabel,
  amountCents,
  statusLabel,
  badgeVariant,
  invoiceId,
  eventType,
  gateway,
  canGenerate,
  canViewInvoices,
  onGenerateBilling,
  onChangeDue,
  compact,
}: {
  dateLabel: string;
  amountCents: number;
  statusLabel: string;
  badgeVariant: FinancialBadgeVariant;
  invoiceId: string | null;
  eventType?: import('@/lib/financialEventTypes').FinancialEventType | null;
  gateway?: string | null;
  canGenerate: boolean;
  canViewInvoices?: boolean;
  onGenerateBilling?: () => void;
  onChangeDue?: () => void;
  compact?: boolean;
}) {
  const secondaryActions =
    canGenerate && onGenerateBilling && !invoiceId ? (
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={onGenerateBilling}>
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Gerar agora
        </Button>
        {onChangeDue ? (
          <Button type="button" size="sm" variant="ghost" onClick={onChangeDue}>
            Alterar vencimento
          </Button>
        ) : null}
      </div>
    ) : null;

  const menuActions = invoiceId ? (
    <InvoiceQuickActions
      invoiceId={invoiceId}
      canViewInvoices={canViewInvoices}
      eventType={eventType}
      gateway={gateway}
      handlers={{
        onGenerateBilling,
        onChangeDue,
      }}
    />
  ) : null;

  if (compact) {
    return (
      <article className="min-w-[160px] shrink-0 rounded-lg border bg-card p-3 space-y-2 snap-start">
        <p className="text-base font-bold tabular-nums">{dateLabel}</p>
        <p className="text-lg font-bold tabular-nums">{formatFinancialAmount(amountCents)}</p>
        <PaymentBadge label={statusLabel} variant={badgeVariant} />
        {secondaryActions ?? menuActions}
      </article>
    );
  }

  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <div className="space-y-1">
        <p className="text-lg font-bold tabular-nums">{dateLabel}</p>
        <p className="text-xl font-bold tabular-nums">{formatFinancialAmount(amountCents)}</p>
        <PaymentBadge label={statusLabel} variant={badgeVariant} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {secondaryActions}
        {menuActions}
      </div>
    </li>
  );
}

export function UpcomingPaymentsList({
  canViewInvoices = true,
  onGenerateBilling,
  onChangeDue,
  className,
}: Props) {
  const store = useFinancialEventStore();
  const isMobile = useIsMobile();
  const receipts = store.getUpcomingReceipts();
  const events = store.events;
  const [expanded, setExpanded] = useState(false);

  const enriched = receipts.map((r) => {
    const ev = events.find((e) => e.ymd === r.ymd);
    return {
      ...r,
      invoiceId: ev?.invoiceId ?? null,
      eventType: ev?.type ?? null,
      gateway: ev?.gateway ?? null,
      failed: ev?.type === 'invoice_failed',
      canGenerate: ev?.type === 'invoice_failed' || ev?.type === 'upcoming_cycle',
      badgeVariant: ev?.statusBadge ?? ('pending' as FinancialBadgeVariant),
    };
  });

  const { visible, hiddenCount, canExpand } = sliceUpcomingReceipts(enriched, expanded);
  const useScroll = shouldUseUpcomingInternalScroll(enriched.length, expanded);
  const maxHeight = upcomingListMaxHeightPx(useScroll);

  if (enriched.length === 0) {
    return (
      <p className={cn('text-center py-8 text-sm text-muted-foreground', className)}>
        Sem recebimentos previstos.
      </p>
    );
  }

  const renderItem = (r: (typeof enriched)[0]) => (
    <ReceiptItem
      key={r.id}
      dateLabel={r.dateLabel}
      amountCents={r.amountCents}
      statusLabel={r.statusLabel}
      badgeVariant={r.badgeVariant}
      invoiceId={r.invoiceId}
      eventType={r.eventType}
      gateway={r.gateway}
      canGenerate={r.canGenerate && !r.invoiceId}
      canViewInvoices={canViewInvoices}
      onGenerateBilling={onGenerateBilling}
      onChangeDue={onChangeDue}
      compact={isMobile}
    />
  );

  if (isMobile) {
    return (
      <div className={cn('space-y-3', className)} id="upcoming-payments">
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1" role="list">
          {visible.map(renderItem)}
        </div>
        {canExpand ? (
          <ExpandButton hiddenCount={hiddenCount} onExpand={() => setExpanded(true)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)} id="upcoming-payments">
      <ol className={cn('space-y-0', useScroll && 'overflow-y-auto pr-1')} style={maxHeight ? { maxHeight } : undefined} role="list">
        {visible.map(renderItem)}
      </ol>
      {canExpand ? (
        <ExpandButton hiddenCount={hiddenCount} onExpand={() => setExpanded(true)} />
      ) : null}
    </div>
  );
}

function ExpandButton({ hiddenCount, onExpand }: { hiddenCount: number; onExpand: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className={cn('w-full gap-1 text-xs text-muted-foreground', focusRingClass())} onClick={onExpand}>
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      {upcomingExpandLabel(hiddenCount)}
    </Button>
  );
}
