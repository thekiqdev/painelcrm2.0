import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildSidebarHealthMetrics } from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatExperienceAmount } from './subscriptionExperienceFormat';
import { SubscriptionRevenueMiniChart } from './SubscriptionRevenueMiniChart';
import { cn } from '@/lib/utils';
import { healthStateEmoji, wcagContrastPair } from '@/lib/billingSubscriptionExperiencePolish';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function SubscriptionFinancialSummaryPanel({ detail, className }: Props) {
  const metrics = useMemo(() => buildSidebarHealthMetrics(detail), [detail]);
  const colors = wcagContrastPair(metrics.healthScore.state);

  const rows = [
    { label: 'Saúde financeira', value: metrics.financialHealthLabel },
    { label: 'Último pagamento', value: metrics.lastPaymentLabel },
    { label: 'Próximo recebimento', value: metrics.nextReceiptLabel },
    {
      label: 'Dias até cobrança',
      value: metrics.daysUntilCharge != null ? `${metrics.daysUntilCharge} dia(s)` : '—',
    },
    { label: 'Receita anual prevista', value: formatExperienceAmount(metrics.annualProjectedCents) },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b py-4 text-center">
          <CardTitle className="text-base font-medium">Saúde</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 pb-6 text-center">
          <div
            className={cn(
              'inline-flex flex-col items-center justify-center rounded-2xl px-8 py-5',
              colors.bg
            )}
            role="meter"
            aria-valuenow={metrics.healthScore.score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Saúde ${metrics.healthScore.score} de 100`}
          >
            <span className="text-2xl mb-1" aria-hidden>
              {healthStateEmoji(metrics.healthScore.state)}
            </span>
            <p className={cn('text-5xl font-bold tabular-nums tracking-tight', colors.fg)}>
              {metrics.healthScore.score}
            </p>
            <p className="text-sm font-medium text-muted-foreground mt-1">{metrics.healthScore.label}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium">Resumo financeiro</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {rows.map((item) => (
            <div key={item.label} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums text-right">{item.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b py-3">
          <CardTitle className="text-sm font-medium">Últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 pb-2">
          <SubscriptionRevenueMiniChart detail={detail} height={140} />
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Receita (verde) · Atrasos (vermelho)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
