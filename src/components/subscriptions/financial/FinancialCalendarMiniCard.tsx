import type { FinancialCalendarKind } from '@/lib/subscriptionFinancialExperience';
import {
  calendarMiniCardEmoji,
  calendarMiniCardLabel,
} from '@/lib/subscriptionFinancialOverview';
import { formatFinancialAmount } from './financialFormat';
import { cn } from '@/lib/utils';

type Props = {
  kind: FinancialCalendarKind;
  amountCents?: number | null;
  className?: string;
};

export function FinancialCalendarMiniCard({ kind, amountCents, className }: Props) {
  const emoji = calendarMiniCardEmoji(kind);
  const label = calendarMiniCardLabel(kind);

  return (
    <div
      className={cn(
        'rounded-md border bg-card/90 px-1 py-0.5 text-[8px] leading-tight shadow-sm',
        kind === 'paid' && 'border-emerald-500/30',
        kind === 'failed' && 'border-red-500/30',
        kind === 'invoiced' && 'border-blue-500/30',
        (kind === 'due' || kind === 'overdue') && 'border-amber-500/30',
        className
      )}
    >
      <div className="flex items-center gap-0.5 font-medium">
        <span aria-hidden>{emoji}</span>
        <span className="truncate">{label}</span>
      </div>
      {amountCents != null ? (
        <p className="tabular-nums font-semibold text-[9px] mt-0.5">{formatFinancialAmount(amountCents)}</p>
      ) : null}
    </div>
  );
}
