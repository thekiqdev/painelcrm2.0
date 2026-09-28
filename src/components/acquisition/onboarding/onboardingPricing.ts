import {
  effectiveCheckoutTrialDays,
  formatMoneyBRL,
  getCheckoutListPriceCents,
} from '@/lib/planCheckoutDisplay';
import type { PublicAcquisitionPlan } from './types';

export type OnboardingPlanPricing = {
  title: string;
  subtext: string;
  primaryPrice: string;
  periodLabel: string;
  pricePrefix?: string;
  extraUserLine?: string;
  /** Badge discreto na vitrine — período inicial, sem “grátis”. */
  activationPeriodLabel?: string;
  isDefault?: boolean;
};

const DEFAULT_SUBTEXT = 'CRM, automações e IA em um único workspace.';

function resolveBillingInterval(plan: PublicAcquisitionPlan): string {
  if (plan.plan_type === 'custom' && plan.interval_prices?.length) {
    const monthly = plan.interval_prices.find((x) => x.billing_interval === 'monthly');
    return monthly?.billing_interval ?? plan.interval_prices[0].billing_interval;
  }
  return plan.billing_interval ?? 'monthly';
}

function periodShort(interval: string): string {
  if (interval === 'yearly') return 'ano';
  if (interval === 'quarterly') return 'trim';
  if (interval === 'semi_annual') return 'sem';
  return 'mês';
}

function intervalRow(plan: PublicAcquisitionPlan, interval: string) {
  return plan.interval_prices?.find((x) => x.billing_interval === interval) ?? plan.interval_prices?.[0];
}

/** Preço de vitrine onboarding — nunca “Sob consulta”; usa dados reais do plano. */
export function getOnboardingPlanPricing(plan: PublicAcquisitionPlan, usersCount = 1): OnboardingPlanPricing {
  const interval = resolveBillingInterval(plan);
  const periodLabel = periodShort(interval);
  const isCustom = plan.plan_type === 'custom';
  const row = intervalRow(plan, interval);
  const users = Math.max(1, usersCount);

  let cents = getCheckoutListPriceCents(
    {
      plan_type: plan.plan_type ?? 'standard',
      price_cents: plan.price_cents,
      interval_prices: plan.interval_prices,
    },
    { usersCount: users, billingInterval: interval },
  );

  let showFrom = isCustom;

  if (cents <= 0 && plan.price_cents > 0) {
    cents = plan.price_cents;
    showFrom = false;
  }
  if (cents <= 0 && row?.price_per_user_cents) {
    cents = row.price_per_user_cents;
    showFrom = true;
  }

  const perUserCents = row?.price_per_user_cents ?? plan.interval_prices?.[0]?.price_per_user_cents;
  let extraUserLine: string | undefined;
  if (isCustom && perUserCents != null && perUserCents > 0) {
    extraUserLine = `+ ${formatMoneyBRL(perUserCents)} por usuário adicional`;
  } else if (!isCustom && plan.max_users != null && plan.max_users > 1 && perUserCents && perUserCents > 0) {
    extraUserLine = `+ ${formatMoneyBRL(perUserCents)} por usuário adicional`;
  }

  const trialDays = effectiveCheckoutTrialDays(plan);
  const activationPeriodLabel =
    trialDays >= 1 ? `Período inicial · ${trialDays} ${trialDays === 1 ? 'dia' : 'dias'}` : undefined;

  return {
    title: plan.name,
    subtext: plan.description?.trim() || DEFAULT_SUBTEXT,
    primaryPrice: formatMoneyBRL(Math.max(0, cents)),
    periodLabel,
    pricePrefix: showFrom ? 'A partir de ' : undefined,
    extraUserLine,
    activationPeriodLabel,
    isDefault: plan.is_default,
  };
}

/** Resumo de preço na etapa de conversão (mesma fonte de dados). */
export function formatOnboardingActivationPrice(plan: PublicAcquisitionPlan, usersCount = 1): string {
  const p = getOnboardingPlanPricing(plan, usersCount);
  return `${p.pricePrefix ?? ''}${p.primaryPrice}/${p.periodLabel}`;
}
