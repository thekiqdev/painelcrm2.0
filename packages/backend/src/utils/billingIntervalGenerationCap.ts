/**
 * Limita antecipação de geração à duração do ciclo e resolve N por periodicidade (Sprint 5.1).
 * - geral: tenants.recurring_invoice_generate_days_before_due
 * - weekly: tenants.recurring_invoice_generate_days_before_due_weekly (NULL = herda geral)
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

export type TenantGenerateDaysBeforeSource = 'weekly' | 'general';

/**
 * SSOT: N bruto do tenant para o intervalo (ainda sem cap).
 * weekly + weeklyCol != null → weekly; senão → geral.
 */
export function resolveTenantGenerateDaysBeforeDueRaw(params: {
  general: unknown;
  weekly?: unknown | null;
  billingInterval: string;
}): { tenantRaw: number; source: TenantGenerateDaysBeforeSource } {
  const interval = (params.billingInterval ?? 'monthly').trim() || 'monthly';
  const general = clampRecurringInvoiceGenerateDaysBeforeDue(params.general);

  if (interval === 'weekly' && params.weekly != null && params.weekly !== '') {
    const n = typeof params.weekly === 'number' ? params.weekly : Number(params.weekly);
    if (Number.isFinite(n)) {
      return {
        tenantRaw: clampRecurringInvoiceGenerateDaysBeforeDue(n),
        source: 'weekly',
      };
    }
  }

  return { tenantRaw: general, source: 'general' };
}

/**
 * Valor efetivo usado pelo scheduler/worker: `min(tenant_raw(interval), cap(intervalo))`.
 * Compat: se só passar o N já escolhido, use a overload de 2 args abaixo.
 */
export function effectiveRecurringGenerateDaysBeforeDue(
  tenantDaysBefore: unknown,
  billingInterval: string
): number;
export function effectiveRecurringGenerateDaysBeforeDue(params: {
  general: unknown;
  weekly?: unknown | null;
  billingInterval: string;
}): number;
export function effectiveRecurringGenerateDaysBeforeDue(
  tenantDaysBeforeOrParams:
    | unknown
    | { general: unknown; weekly?: unknown | null; billingInterval: string },
  billingInterval?: string,
): number {
  if (
    tenantDaysBeforeOrParams != null &&
    typeof tenantDaysBeforeOrParams === 'object' &&
    !Array.isArray(tenantDaysBeforeOrParams) &&
    'billingInterval' in tenantDaysBeforeOrParams &&
    'general' in tenantDaysBeforeOrParams
  ) {
    const p = tenantDaysBeforeOrParams as {
      general: unknown;
      weekly?: unknown | null;
      billingInterval: string;
    };
    const { tenantRaw } = resolveTenantGenerateDaysBeforeDueRaw(p);
    const cap = maxRecurringGenerateDaysBeforeForInterval(p.billingInterval);
    return Math.min(tenantRaw, cap);
  }

  const tenant = clampRecurringInvoiceGenerateDaysBeforeDue(tenantDaysBeforeOrParams);
  const cap = maxRecurringGenerateDaysBeforeForInterval(billingInterval ?? 'monthly');
  return Math.min(tenant, cap);
}

export function isGenerateDaysBeforeCappedForInterval(
  tenantDaysBefore: unknown,
  billingInterval: string
): boolean {
  const tenant = clampRecurringInvoiceGenerateDaysBeforeDue(tenantDaysBefore);
  return tenant > maxRecurringGenerateDaysBeforeForInterval(billingInterval);
}

/** Cap check após resolver general/weekly. */
export function isGenerateDaysBeforeCappedForTenant(params: {
  general: unknown;
  weekly?: unknown | null;
  billingInterval: string;
}): boolean {
  const { tenantRaw } = resolveTenantGenerateDaysBeforeDueRaw(params);
  return isGenerateDaysBeforeCappedForInterval(tenantRaw, params.billingInterval);
}
