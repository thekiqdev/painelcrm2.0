import { Button } from '@/components/ui/button';
import type { FinancialHistoryRow } from '@/lib/billingSubscriptionExperience';
import { historyRowShowsChargeAction, historyRowChargeActionLabel } from '@/lib/subscriptionRenewalRecovery';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { Loader2, Zap } from 'lucide-react';

type Props = {
  row: FinancialHistoryRow;
  loading?: boolean;
  onGenerate?: (row: FinancialHistoryRow) => void;
  className?: string;
};

export function HistoryRowChargeAction({
  row,
  loading = false,
  onGenerate,
  className,
}: Props) {
  if (!historyRowShowsChargeAction(row)) return null;

  const label = historyRowChargeActionLabel(row);

  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      className={cn('h-8 gap-1.5 text-xs', focusRingClass(), className)}
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        onGenerate?.(row);
      }}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Zap className="h-3.5 w-3.5" aria-hidden />
      )}
      {loading ? 'Gerando…' : label}
    </Button>
  );
}
