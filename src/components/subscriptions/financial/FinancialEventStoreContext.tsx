import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { financialTodayYmd, resolveFinancialTimeZone } from '@/lib/billingSafeDate';
import { createBillingExperienceStore } from '@/lib/billingCutover/createBillingExperienceStore';
import {
  financialEventStoreSignature,
  type FinancialEventStore,
} from '@/lib/subscriptionFinancialEventStore';

type FinancialExperienceContextValue = {
  store: FinancialEventStore;
  timeZone: string;
  onPaymentConfirmed?: () => void | Promise<void>;
};

const FinancialEventStoreContext = createContext<FinancialExperienceContextValue | null>(null);

type ProviderProps = {
  detail: CrmSubscriptionDetailPayload;
  onPaymentConfirmed?: () => void | Promise<void>;
  children: ReactNode;
};

export function FinancialEventStoreProvider({
  detail,
  onPaymentConfirmed,
  children,
}: ProviderProps) {
  const timeZone = resolveFinancialTimeZone(detail.tenant_billing?.timezone);
  const signature = financialEventStoreSignature(detail);
  const todayYmd = financialTodayYmd(timeZone);

  const value = useMemo(
    () => ({
      store: createBillingExperienceStore(detail, todayYmd),
      timeZone,
      onPaymentConfirmed,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature captures timeline mutations
    [signature, timeZone, onPaymentConfirmed, todayYmd]
  );

  return (
    <FinancialEventStoreContext.Provider value={value}>{children}</FinancialEventStoreContext.Provider>
  );
}

function useFinancialExperience(): FinancialExperienceContextValue {
  const ctx = useContext(FinancialEventStoreContext);
  if (!ctx) {
    throw new Error('useFinancialEventStore must be used within FinancialEventStoreProvider');
  }
  return ctx;
}

export function useFinancialEventStore(): FinancialEventStore {
  return useFinancialExperience().store;
}

export function useFinancialTimeZone(): string {
  return useFinancialExperience().timeZone;
}

export function usePaymentConfirmedHandler(): (() => void | Promise<void>) | undefined {
  return useFinancialExperience().onPaymentConfirmed;
}

export function useOptionalFinancialEventStore(): FinancialEventStore | null {
  return useContext(FinancialEventStoreContext)?.store ?? null;
}
