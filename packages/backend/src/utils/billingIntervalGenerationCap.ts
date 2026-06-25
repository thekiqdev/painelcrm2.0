/**
 * Limita `recurring_invoice_generate_days_before_due` à duração do ciclo da assinatura.
 * Evita que antecipação mensal (ex.: 7 dias) sobreponha ciclos semanais ou dispare geração imediata.
 */
import type { BillingInterval } from '../services/billingSubscriptionService.js';
import { clampRecurringInvoiceGenerateDaysBeforeDue } from './billingGenerationDate.js';

/** Duração civil aproximada de cada periodicidade (dias). */
const BILLING_INTERVAL_CYCLE_DAYS: Record<BillingInterval, number> = {
  weekly: 7,
  monthly: 31,
  quarterly: 93,
  semi_annual: 186,
  yearly: 366,
};

const KNOWN_INTERVALS = new Set<string>(Object.keys(BILLING_INTERVAL_CYCLE_DAYS));

/**
 * Máximo de dias de antecipação seguros para a periodicidade (sempre < duração do ciclo).
 */
export function maxRecurringGenerateDaysBeforeForInterval(billingInterval: string): number {
  const key = KNOWN_INTERVALS.has(billingInterval) ? (billingInterval as BillingInterval) : 'monthly';
  const cycleDays = BILLING_INTERVAL_CYCLE_DAYS[key];
  return Math.max(0, cycleDays - 1);
}

/**
 * Valor efetivo usado pelo scheduler/worker: `min(tenant, cap(intervalo))`.
 */
export function effectiveRecurringGenerateDaysBeforeDue(
  tenantDaysBefore: unknown,
  billingInterval: string
): number {
  const tenant = clampRecurringInvoiceGenerateDaysBeforeDue(tenantDaysBefore);
  const cap = maxRecurringGenerateDaysBeforeForInterval(billingInterval);
  return Math.min(tenant, cap);
}

export function isGenerateDaysBeforeCappedForInterval(
  tenantDaysBefore: unknown,
  billingInterval: string
): boolean {
  const tenant = clampRecurringInvoiceGenerateDaysBeforeDue(tenantDaysBefore);
  return tenant > maxRecurringGenerateDaysBeforeForInterval(billingInterval);
}
