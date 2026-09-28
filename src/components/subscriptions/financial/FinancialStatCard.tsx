import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BADGE_VARIANT_STYLES, type FinancialBadgeVariant } from '@/lib/financialStatusBadge';
import { focusRingClass } from '@/lib/billingSubscriptionExperiencePolish';

type Props = {
  label: string;
  primary: string;
  secondary?: string | null;
  className?: string;
};

export function FinancialStatCard({ label, primary, secondary, className }: Props) {
  return (
    <Card className={cn('border shadow-sm hover:shadow-md transition-shadow duration-200', className)}>
      <CardContent className="pt-4 pb-4 px-4 space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{primary}</p>
        {secondary ? (
          <p className="text-xs text-muted-foreground">{secondary}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PaymentBadge({
  label,
  variant = 'default',
}: {
  label: string;
  variant?: FinancialBadgeVariant;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
        BADGE_VARIANT_STYLES[variant]
      )}
    >
      {label}
    </span>
  );
}

export { focusRingClass };
