import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  buildPremiumKpiCards,
  compareKpiTrend,
  polishTransitionClass,
  type PremiumKpiCard,
} from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { cn } from '@/lib/utils';
import { Calendar, Clock, FileText, TrendingUp, Wallet, AlertCircle } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

const ICONS = {
  wallet: Wallet,
  calendar: Calendar,
  clock: Clock,
  file: FileText,
  trend: TrendingUp,
  alert: AlertCircle,
};

function accentClass(accent: PremiumKpiCard['accent']): string {
  if (accent === 'positive') return 'text-emerald-600 dark:text-emerald-400';
  if (accent === 'negative') return 'text-red-600 dark:text-red-400';
  if (accent === 'warning') return 'text-amber-600 dark:text-amber-400';
  return 'text-foreground';
}

export function SubscriptionSummaryCards({ detail, className }: Props) {
  const cards = useMemo(() => buildPremiumKpiCards(detail), [detail]);

  return (
    <div
      className={cn('grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', className)}
      role="region"
      aria-label="Indicadores financeiros"
    >
      {cards.map((card) => {
        const Icon = ICONS[card.icon];
        return (
          <Card
            key={card.key}
            className={cn(
              'border shadow-sm hover:shadow-md hover:border-border/80',
              polishTransitionClass()
            )}
          >
            <CardContent className="pt-4 pb-4 px-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                {card.comparisonPct != null ? (
                  <span
                    className={cn(
                      'text-[10px] font-medium tabular-nums',
                      card.comparisonPct >= 0 ? 'text-emerald-600' : 'text-red-600'
                    )}
                  >
                    {compareKpiTrend(card.comparisonPct)}
                  </span>
                ) : null}
              </div>
              <p className={cn('text-2xl font-bold tabular-nums tracking-tight leading-none', accentClass(card.accent))}>
                {card.value}
              </p>
              <div>
                <p className="text-xs font-medium text-foreground leading-tight">{card.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {card.comparisonLabel ?? card.description}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
