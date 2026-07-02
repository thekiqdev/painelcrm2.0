import { useEffect, useRef } from 'react';
import { buildFinancialAlerts } from '@/lib/subscriptionFinancialExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import {
  resolveFinancialPageScrollTarget,
  scrollToFinancialTarget,
} from '@/lib/timelineNavigation';
import { useFinancialEventStore } from './FinancialEventStoreContext';

type Props = {
  detail: CrmSubscriptionDetailPayload;
};

/** Scroll inteligente ao abrir a tela (falha → atraso → calendário). */
export function FinancialSmartScroll({ detail }: Props) {
  const store = useFinancialEventStore();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const alerts = buildFinancialAlerts(detail, store.today);
    const target = resolveFinancialPageScrollTarget(store.events, alerts, store.today);
    if (!target) return;
    requestAnimationFrame(() => {
      scrollToFinancialTarget(target, 'smooth');
    });
  }, [detail, store]);

  return null;
}
