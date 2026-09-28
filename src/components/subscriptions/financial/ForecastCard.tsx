import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export function ForecastCard({ className }: Props) {
  const store = useFinancialEventStore();
  const months = store.getMonthOverview();

  return (
    <Card className={cn('border shadow-sm', className)}>
      <CardHeader className="bg-muted/30 border-b py-3">
        <CardTitle className="text-sm font-medium">Visão mensal</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-0">
        {months.map((m, idx) => (
          <div
            key={m.monthKey}
            className={cn(
              'flex items-start gap-3 py-3',
              idx < months.length - 1 && 'border-b border-border/60'
            )}
          >
            <span className="text-lg shrink-0 w-6 text-center" aria-hidden>{m.statusIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-sm">{m.monthLabel}</p>
                <p className="text-xs font-medium text-muted-foreground">{m.statusLabel}</p>
              </div>
              {m.detailLabel ? (
                <p className="text-sm text-muted-foreground mt-0.5">{m.detailLabel}</p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
