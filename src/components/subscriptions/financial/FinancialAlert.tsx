import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FinancialAlert } from '@/lib/subscriptionFinancialExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { cn } from '@/lib/utils';
import { focusRingClass } from './FinancialStatCard';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  onResolve?: (alert: FinancialAlert) => void;
  className?: string;
};

export function FinancialAlertList({ detail, onResolve, className }: Props) {
  const store = useFinancialEventStore();
  const alerts = store.getFinancialAlerts();

  if (alerts.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)} role="region" aria-label="Alertas financeiros">
      {alerts.map((alert) => (
        <Card key={alert.id} className="border-amber-500/30 bg-amber-500/5 shadow-sm">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <div className="flex gap-3 min-w-0">
              <span className="text-lg shrink-0" aria-hidden>{alert.emoji}</span>
              <div>
                <p className="font-medium text-sm">{alert.title}</p>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
              </div>
            </div>
            {onResolve ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('shrink-0', focusRingClass())}
                onClick={() => onResolve(alert)}
              >
                {alert.actionLabel ?? 'Resolver agora'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
