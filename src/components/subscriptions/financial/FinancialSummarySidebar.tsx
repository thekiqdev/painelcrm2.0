import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { alertShowsTechnicalDetail } from '@/lib/subscriptionActionExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialAlert } from '@/lib/subscriptionFinancialExperience';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { resolveAlertScrollTarget, scrollToFinancialTarget } from '@/lib/timelineNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { formatFinancialAmount } from './financialFormat';
import { focusRingClass, PaymentBadge } from './FinancialStatCard';
import { PanelRight } from 'lucide-react';
import type { GenerateBillingTarget } from '@/lib/subscriptionBillingGeneration';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  onResolveAlert?: (alert: FinancialAlert) => void;
  onGenerateBilling?: (target?: GenerateBillingTarget) => void;
  onViewTechnicalDetail?: (alert: FinancialAlert) => void;
  className?: string;
};

function SidebarBody({
  detail,
  onResolveAlert,
  onGenerateBilling,
  onViewTechnicalDetail,
}: {
  detail: CrmSubscriptionDetailPayload;
  onResolveAlert?: (alert: FinancialAlert) => void;
  onGenerateBilling?: (target?: GenerateBillingTarget) => void;
  onViewTechnicalDetail?: (alert: FinancialAlert) => void;
}) {
  const store = useFinancialEventStore();
  const summary = store.getSidebarSummary();
  const nextInvoice = store.getNextChargePresentation();
  const alerts = store.getFinancialAlerts();

  const metrics = [
    { label: 'Último pagamento', primary: summary.lastPaymentDate, secondary: summary.lastPaymentAmount },
    { label: 'Próximo recebimento', primary: summary.nextReceiptDate, secondary: summary.nextReceiptAmount },
    { label: 'Receita anual', primary: summary.annualRevenue, secondary: null },
    { label: 'Valor em aberto', primary: summary.openAmount, secondary: null },
  ];

  const handleAlertAction = (alert: FinancialAlert) => {
    if (alert.kind === 'billing_missing') {
      const resolved = store.resolveCyclePresentation(nextInvoice.cycleId, 'NEXT_GENERATE');
      if (!resolved.canGenerate || !nextInvoice.cycleId) return;
      onGenerateBilling?.({
        cycleId: nextInvoice.cycleId,
        dueYmd: nextInvoice.dueYmd,
        componentName: 'FinancialSummarySidebar',
      });
      return;
    }
    const target = resolveAlertScrollTarget(alert, store.events, store.today);
    scrollToFinancialTarget(target);
    onResolveAlert?.(alert);
  };

  return (
    <>
      <Card className={FINANCIAL_CARD_SHELL}>
        <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-3')}>
          <CardTitle className="text-sm font-medium">Resumo financeiro</CardTitle>
        </CardHeader>
        <CardContent className={cn(FINANCIAL_CARD_BODY, 'space-y-4')}>
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-lg font-bold tabular-nums">{m.primary}</p>
              {m.secondary ? <p className="text-sm text-muted-foreground tabular-nums">{m.secondary}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className={FINANCIAL_CARD_SHELL}>
        <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-3')}>
          <CardTitle className="text-sm font-medium">Próxima cobrança</CardTitle>
        </CardHeader>
        <CardContent className={cn(FINANCIAL_CARD_BODY, 'pt-3 space-y-3')}>
          <p className="text-lg font-bold tabular-nums">{nextInvoice.dateLabelShort}</p>
          <p className="text-sm font-semibold tabular-nums">{formatFinancialAmount(nextInvoice.amountCents)}</p>
          <PaymentBadge
            label={nextInvoice.statusLabel}
            variant={nextInvoice.statusKey === 'paid' ? 'paid' : 'pending'}
          />
        </CardContent>
      </Card>

      {alerts.length > 0 ? (
        <Card className="border border-amber-500/30 bg-amber-500/5 shadow-sm" id="financial-sidebar-alerts">
          <CardHeader className="py-3 border-b border-amber-500/20">
            <CardTitle className="text-sm font-medium">Atenção</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="space-y-2">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.message}</p>
                {alertShowsTechnicalDetail(alert) ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => onViewTechnicalDetail?.(alert)}
                  >
                    Ver detalhes
                  </button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('w-full', focusRingClass())}
                  onClick={() => handleAlertAction(alert)}
                >
                  {alert.actionLabel ?? 'Gerar agora'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export function FinancialSummarySidebar({
  detail,
  onResolveAlert,
  onGenerateBilling,
  onViewTechnicalDetail,
  className,
}: Props) {
  const isMobile = useIsMobile();
  const body = (
    <SidebarBody
      detail={detail}
      onResolveAlert={onResolveAlert}
      onGenerateBilling={onGenerateBilling}
      onViewTechnicalDetail={onViewTechnicalDetail}
    />
  );

  if (!isMobile) {
    return (
      <aside className={cn('space-y-5', className)} aria-label="Resumo financeiro lateral">
        {body}
      </aside>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className={cn('w-full gap-2 lg:hidden', focusRingClass())} aria-label="Abrir resumo">
          <PanelRight className="h-4 w-4" aria-hidden />
          Resumo financeiro
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl" data-focus-trap-root>
        <SheetHeader>
          <SheetTitle>Resumo financeiro</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5 pb-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
