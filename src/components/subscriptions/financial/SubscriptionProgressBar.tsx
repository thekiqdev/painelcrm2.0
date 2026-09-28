import { cn } from '@/lib/utils';
import { progressBarBlocks } from '@/lib/subscriptionFinancialExperience';

type Props = {
  pct: number;
  label: string;
  className?: string;
};

export function SubscriptionProgressBar({ pct, label, className }: Props) {
  const blocks = progressBarBlocks(pct);
  return (
    <div className={cn('space-y-1.5', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums font-medium">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-crm-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground font-mono tracking-widest" aria-hidden>
        {blocks}
      </p>
    </div>
  );
}
