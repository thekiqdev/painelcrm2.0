import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { formatFinancialAmount } from './financialFormat';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export function FinancialUpcomingAgenda({ className }: Props) {
  const store = useFinancialEventStore();
  const items = store.getUpcomingAgenda(5);

  if (items.length === 0) return null;

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)} id="financial-upcoming-agenda">
      <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-3')}>
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Próximos eventos
        </CardTitle>
      </CardHeader>
      <CardContent className={cn(FINANCIAL_CARD_BODY, 'pt-3 space-y-0')}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-3 py-3',
              idx < items.length - 1 && 'border-b border-border/60'
            )}
          >
            <div className="shrink-0 w-16">
              <p className={cn('text-sm font-bold tabular-nums', item.isToday && 'text-crm-primary')}>
                {item.dateLabel}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              {item.amountCents != null ? (
                <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                  {formatFinancialAmount(item.amountCents)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
