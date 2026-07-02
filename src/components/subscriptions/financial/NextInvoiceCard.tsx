import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { resolveNextChargePresentationFromStore } from '@/lib/subscriptionFinancialEvents';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { PaymentBadge, focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { Eye, Loader2, Zap } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  generating?: boolean;
  onGenerateBilling?: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
  className?: string;
};

function statusBadgeVariant(
  key: 'pending' | 'issued' | 'paid' | 'cancelled' | 'paused'
): 'pending' | 'paid' | 'cancelled' | 'default' {
  if (key === 'paid') return 'paid';
  if (key === 'cancelled') return 'cancelled';
  if (key === 'pending' || key === 'issued') return 'pending';
  return 'default';
}

export function NextInvoiceCard({
  detail,
  generating = false,
  onGenerateBilling,
  onOpenInvoice,
  className,
}: Props) {
  const store = useFinancialEventStore();
  const next = resolveNextChargePresentationFromStore(store);
  const showAction = detail.subscription.status === 'active' && (next.hasInvoice ? onOpenInvoice : onGenerateBilling);

  if (!next.visible && !next.dueYmd) return null;

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)} id="next-invoice-card">
      <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-4')}>
        <CardTitle className="text-base font-semibold">Próxima cobrança</CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          {next.hasInvoice ? 'Cobrança gerada — abra ou avance para a próxima competência' : 'Competência disponível para geração antecipada'}
        </p>
      </CardHeader>
      <CardContent className={cn(FINANCIAL_CARD_BODY, 'space-y-4')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Vencimento</p>
            <p className="text-xl font-bold tabular-nums tracking-tight">{next.dateLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor</p>
            <p className="text-xl font-bold tabular-nums">{next.amountLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Competência</p>
            <p className="text-sm font-medium tabular-nums">{next.competenceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
            <div className="mt-1">
              <PaymentBadge label={next.statusLabel} variant={statusBadgeVariant(next.statusKey)} />
            </div>
          </div>
        </div>

        {showAction ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={next.hasInvoice ? 'outline' : 'default'}
              className={cn('gap-1.5', focusRingClass())}
              disabled={generating}
              onClick={() => {
                if (next.hasInvoice && next.invoiceId) {
                  onOpenInvoice?.(next.invoiceId);
                } else {
                  onGenerateBilling?.();
                }
              }}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : next.hasInvoice ? (
                <Eye className="h-4 w-4" aria-hidden />
              ) : (
                <Zap className="h-4 w-4" aria-hidden />
              )}
              {generating ? 'Gerando…' : next.actionLabel}
            </Button>
            {next.hasInvoice && next.dueYmd ? (
              <p className="text-xs text-muted-foreground">
                venc. {formatYmdBrSafe(next.dueYmd)}
                {next.invoiceDisplayRef ? ` · ${next.invoiceDisplayRef}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
