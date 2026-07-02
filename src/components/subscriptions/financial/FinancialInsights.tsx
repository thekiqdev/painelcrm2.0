import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { cn } from '@/lib/utils';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';

type Props = {
  className?: string;
};

export function FinancialInsights({ className }: Props) {
  const store = useFinancialEventStore();
  const insights = store.getInsights();

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)}>
      <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-3')}>
        <CardTitle className="text-sm font-medium">Insights financeiros</CardTitle>
      </CardHeader>
      <CardContent className={cn(FINANCIAL_CARD_BODY, 'space-y-3')}>
        {insights.map((ins) => (
          <div key={ins.id} className="flex gap-2 text-sm">
            <span aria-hidden>{ins.icon}</span>
            <p className="text-muted-foreground leading-relaxed">{ins.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
