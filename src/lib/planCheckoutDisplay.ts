/**
 * Preço de vitrine no checkout/landing (Fase 1): não usar "Grátis" só por is_free;
 * valor listado = preço de referência da assinatura; dias grátis vão em tag separada.
 */

export function getCheckoutListPriceCents(
  p: {
    plan_type: string;
    price_cents: number;
    interval_prices?: Array<{ billing_interval: string; price_per_user_cents: number }>;
  },
  opts: { usersCount: number; billingInterval: string }
): number {
  if (p.plan_type === 'custom' && p.interval_prices && p.interval_prices.length > 0) {
    const row =
      p.interval_prices.find((x) => x.billing_interval === opts.billingInterval) ?? p.interval_prices[0];
    return Math.max(0, (row?.price_per_user_cents ?? 0) * opts.usersCount);
  }
  return Math.max(0, p.price_cents);
}

export function formatMoneyBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Rótulo de preço na vitrine: nunca retorna a palavra "Grátis" (evita confundir com trial/cobrança). */
export function formatVitrinePriceLabel(cents: number): string {
  if (cents > 0) return formatMoneyBRL(cents);
  return 'Sob consulta';
}

export function freeAccessDaysBadge(isFree: boolean | undefined, days: number | null | undefined): string | null {
  if (isFree === true && days != null && Number(days) >= 1) {
    const n = Number(days);
    return `${n} ${n === 1 ? 'dia grátis' : 'dias grátis'}`;
  }
  return null;
}

/** Dias efetivos de trial no checkout (Fase 2): prioriza trial_days; compat com is_free + free_access_days legado. */
export function effectiveCheckoutTrialDays(p: {
  trial_days?: number | null;
  is_free?: boolean;
  free_access_days?: number | null;
}): number {
  const td = Math.max(0, Math.floor(Number(p.trial_days ?? 0)));
  if (td >= 1) return td;
  if (p.is_free === true && p.free_access_days != null) {
    const fd = Math.floor(Number(p.free_access_days));
    if (fd >= 1) return fd;
  }
  return 0;
}

/** Plano entra no fluxo trial inicial (sem cobrança imediata) no checkout anônimo. */
export function planHasCheckoutTrial(p: {
  trial_days?: number | null;
  is_free?: boolean;
  free_access_days?: number | null;
}): boolean {
  return effectiveCheckoutTrialDays(p) >= 1;
}
