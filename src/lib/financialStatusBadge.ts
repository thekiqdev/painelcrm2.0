import type { FinancialCalendarKind } from './subscriptionFinancialExperience';
import type { CalendarVisualKind } from './billingSubscriptionExperience';

export type FinancialBadgeVariant = 'paid' | 'pending' | 'failed' | 'overdue' | 'cancelled' | 'default';

export function badgeVariantFromCalendarKind(kind: FinancialCalendarKind): FinancialBadgeVariant {
  if (kind === 'paid') return 'paid';
  if (kind === 'failed' || kind === 'overdue') return kind === 'failed' ? 'failed' : 'overdue';
  if (kind === 'cancelled') return 'cancelled';
  if (kind === 'invoiced' || kind === 'due' || kind === 'reprocessed') return 'pending';
  return 'default';
}

export function badgeVariantFromVisual(visual: CalendarVisualKind | string): FinancialBadgeVariant {
  if (visual === 'paid') return 'paid';
  if (visual === 'overdue') return 'overdue';
  if (visual === 'cancelled') return 'cancelled';
  if (visual === 'generated' || visual === 'future' || visual === 'reprocessed') return 'pending';
  return 'default';
}

export function badgeVariantFromHistoryStatus(
  visual: CalendarVisualKind | string,
  statusPt: string,
  invoiceId: string | null
): FinancialBadgeVariant {
  const st = statusPt.toLowerCase();
  if (visual === 'paid' || st.includes('pago')) return 'paid';
  if (st.includes('falh') || st.includes('recus') || st.includes('erro')) return 'failed';
  if (visual === 'overdue' || st.includes('atras')) return 'overdue';
  if (visual === 'cancelled' || st.includes('cancel')) return 'cancelled';
  if (!invoiceId && (st.includes('aguard') || st.includes('previst'))) return 'pending';
  return badgeVariantFromVisual(visual);
}

export const BADGE_VARIANT_STYLES: Record<FinancialBadgeVariant, string> = {
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  overdue: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  default: 'bg-muted text-muted-foreground border-border',
};
