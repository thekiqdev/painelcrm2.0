/**
 * CS S3 — resolve valor comercial da assinatura para UI (hero / próxima cobrança).
 * Espelha `resolveSubscriptionCommercialDisplayCents` do backend.
 */
export function resolveSubscriptionCommercialDisplayCents(params: {
  planType: string | null | undefined;
  amountCents: number;
  contractedPlanPriceCents?: number | null;
  contractedPricePerUserCents?: number | null;
  usersCount?: number | null;
}): number {
  if (params.planType === 'custom') {
    const pu = params.contractedPricePerUserCents;
    if (pu != null && pu >= 0) {
      const seats = Math.max(1, params.usersCount ?? 1);
      return Math.max(0, Math.round(pu * seats));
    }
  }
  const contracted = params.contractedPlanPriceCents;
  if (contracted != null && contracted >= 0) return Math.trunc(contracted);
  return Math.max(0, Math.trunc(params.amountCents));
}
