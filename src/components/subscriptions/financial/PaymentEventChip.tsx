import type { FinancialCalendarKind } from '@/lib/subscriptionFinancialExperience';
import {
  paymentEventChipLabel,
  paymentEventChipVariant,
} from '@/lib/subscriptionFinancialRefinement';
import { BADGE_VARIANT_STYLES } from '@/lib/financialStatusBadge';
import { formatFinancialAmount } from './financialFormat';
import { cn } from '@/lib/utils';

const EMOJI: Record<FinancialCalendarKind, string> = {
  paid: '🟢',
  failed: '🔴',
  invoiced: '🔵',
  due: '🟠',
  overdue: '🔴',
  cancelled: '⚫',
  reprocessed: '🔄',
};

type Props = {
  kind: FinancialCalendarKind;
  amountCents?: number | null;
  className?: string;
};

export function PaymentEventChip({ kind, amountCents, className }: Props) {
  const variant = paymentEventChipVariant(kind);
  const label = paymentEventChipLabel(kind);
  const styleKey = variant === 'muted' ? 'default' : variant;

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-tight',
        BADGE_VARIANT_STYLES[styleKey],
        className
      )}
    >
      <span aria-hidden>{EMOJI[kind]}</span>
      <span className="truncate">{label}</span>
      {amountCents != null ? (
        <span className="tabular-nums font-semibold shrink-0">{formatFinancialAmount(amountCents)}</span>
      ) : null}
    </span>
  );
}
