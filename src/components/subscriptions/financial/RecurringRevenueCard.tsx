import type { FinancialKpiKey } from '@/lib/subscriptionFinancialExperience';
import {
  isKpiClickable,
  resolveKpiClickAction,
  type KpiClickAction,
} from '@/lib/subscriptionFinancialRefinement';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { FinancialStatCard } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { focusRingClass } from './FinancialStatCard';

type Props = {
  latestPaidInvoiceId?: string | null;
  onKpiAction?: (action: KpiClickAction, key: FinancialKpiKey) => void;
  className?: string;
};

export function RecurringRevenueCard({ latestPaidInvoiceId, onKpiAction, className }: Props) {
  const store = useFinancialEventStore();
  const cards = store.getKpiCards();
  const nextReceipt = store.getUpcomingReceipts()[0];

  return (
    <div
      className={cn('grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', className)}
      role="region"
      aria-label="Indicadores financeiros da assinatura"
    >
      {cards.map((card) => {
        const clickable = isKpiClickable(card.key) && Boolean(onKpiAction);
        const action = resolveKpiClickAction(card.key, latestPaidInvoiceId, nextReceipt?.ymd ?? null);

        if (clickable && action.type !== 'none') {
          return (
            <button
              key={card.key}
              type="button"
              className={cn('text-left rounded-lg', focusRingClass())}
              aria-label={`${card.label}: ${card.primary}. Clique para detalhes.`}
              onClick={() => onKpiAction?.(action, card.key)}
            >
              <FinancialStatCard
                label={card.label}
                primary={card.primary}
                secondary={card.secondary}
                className="h-full cursor-pointer hover:border-crm-primary/30"
              />
            </button>
          );
        }

        return (
          <FinancialStatCard
            key={card.key}
            label={card.label}
            primary={card.primary}
            secondary={card.secondary}
          />
        );
      })}
    </div>
  );
}
