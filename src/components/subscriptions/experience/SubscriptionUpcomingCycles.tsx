import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildFutureTimelineSteps,
  formatNextChargePremium,
  polishTransitionClass,
} from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatExperienceAmount } from './subscriptionExperienceFormat';
import { SubscriptionExperienceEmptyState } from './SubscriptionExperienceEmptyState';
import { detectExperienceEmpty } from '@/lib/billingSubscriptionExperiencePolish';
import { cn } from '@/lib/utils';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function SubscriptionUpcomingCycles({ detail, className }: Props) {
  const steps = useMemo(() => buildFutureTimelineSteps(detail), [detail]);
  const empty = detectExperienceEmpty('forecast', detail);

  if (empty === 'forecast' || steps.length === 0) {
    return <SubscriptionExperienceEmptyState kind="forecast" className={className} />;
  }

  return (
    <Card className={cn('border shadow-sm overflow-hidden', className)}>
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Próximos ciclos</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 pb-6">
        <ol className="relative max-w-md mx-auto" aria-label="Previsão de ciclos futuros">
          {steps.map((step, idx) => (
            <li key={step.id} className="relative flex gap-4 pb-8 last:pb-0">
              {idx < steps.length - 1 ? (
                <span
                  className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                  step.highlight
                    ? 'border-crm-primary bg-crm-primary text-primary-foreground'
                    : 'border-muted-foreground/30 bg-background'
                )}
                aria-hidden
              >
                {idx + 1}
              </span>
              <div className={cn('flex-1 min-w-0 pt-0.5', polishTransitionClass())}>
                <p className={cn('font-semibold text-sm', step.highlight && 'text-crm-primary')}>
                  {step.label}
                </p>
                {step.sublabel ? (
                  <p className="text-sm text-muted-foreground tabular-nums mt-0.5">
                    {step.amountCents != null
                      ? formatExperienceAmount(step.amountCents)
                      : step.sublabel}
                  </p>
                ) : null}
                {step.ymd && step.label !== 'Receita prevista' ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatNextChargePremium(step.ymd)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
