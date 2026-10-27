/** Mapeia intervalo do catálogo PainelCRM para recorrência Stripe. */

export type StripeRecurring = {
  interval: 'month' | 'year';
  interval_count: number;
};

export function billingIntervalToStripeRecurring(interval: string): StripeRecurring {
  switch (interval) {
    case 'quarterly':
      return { interval: 'month', interval_count: 3 };
    case 'semi_annual':
      return { interval: 'month', interval_count: 6 };
    case 'yearly':
      return { interval: 'year', interval_count: 1 };
    case 'weekly':
      return { interval: 'month', interval_count: 1 };
    default:
      return { interval: 'month', interval_count: 1 };
  }
}
