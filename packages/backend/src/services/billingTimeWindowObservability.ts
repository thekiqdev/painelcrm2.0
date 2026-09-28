/**
 * Helper central da janela local por tenant.
 * Na Fase 2 passa a ser usado para decisões reais no scheduler/worker.
 */

import {
  computeRecurringInvoiceGenerationDateYmd,
} from '../utils/billingGenerationDate.js';
import {
  effectiveRecurringGenerateDaysBeforeDue,
  isGenerateDaysBeforeCappedForTenant,
  resolveTenantGenerateDaysBeforeDueRaw,
} from '../utils/billingIntervalGenerationCap.js';
import { resolveTenantBillingPreferences } from './tenantBillingPreferencesService.js';

export type BillingWindowReason =
  | 'eligible_by_window'
  | 'too_early_local_time'
  | 'future_local_date'
  | 'timezone_fallback_applied';

export interface BillingWindowDiagnostic {
  tenant_timezone_raw: string | null;
  timezone_effective: string;
  timezone_source: 'tenant' | 'fallback_default';
  timezone_valid: boolean;
  fallback_applied: boolean;
  generate_time_local_effective: string;
  generate_time_source: 'tenant' | 'fallback_default';
  local_now_ymd: string;
  local_now_hhmm: string;
  /** Data de vencimento do ciclo (= `subscriptions.next_billing_date` canónico). */
  next_billing_date: string;
  /** Primeiro dia civil local em que o scheduler pode enfileirar (ciclo − N dias). */
  generation_date_ymd: string;
  /** Valor efetivo de dias de antecipação (0–60). */
  recurring_generate_days_before_due: number;
  /** Valor bruto do tenant (antes do cap por periodicidade). */
  recurring_generate_days_before_due_tenant: number;
  /** `true` quando o tenant pede mais dias do que a periodicidade permite. */
  generate_days_capped_for_interval: boolean;
  billing_interval_effective: string;
  would_be_eligible_by_window: boolean;
  reason: BillingWindowReason;
  phase: 'window_runtime_phase2';
}

function localNowParts(now: Date, timeZone: string): { ymd: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const ymd = `${map.year}-${map.month}-${map.day}`;
  const hhmm = `${map.hour}:${map.minute}`;
  return { ymd, hhmm };
}

function compareHhMm(a: string, b: string): number {
  const [ah, am] = a.split(':').map((v) => parseInt(v, 10));
  const [bh, bm] = b.split(':').map((v) => parseInt(v, 10));
  const ax = ah * 60 + am;
  const bx = bh * 60 + bm;
  return ax - bx;
}

export function buildBillingWindowDiagnostic(params: {
  tenantTimezoneRaw: string | null | undefined;
  recurringGenerateTimeLocalRaw?: string | null | undefined;
  invoiceNotifySameAsGenerationRaw?: boolean | null | undefined;
  invoiceNotifyTimeLocalRaw?: string | null | undefined;
  /** Data de vencimento do ciclo (YYYY-MM-DD), igual a `subscriptions.next_billing_date`. */
  nextBillingDate: string;
  /** Dias antes do vencimento (geral / não-semanal). Default 0. */
  recurringInvoiceGenerateDaysBeforeDue?: number | null;
  /** Dias antes para weekly; null/omit = herda o geral. */
  recurringInvoiceGenerateDaysBeforeDueWeekly?: number | null;
  /** Periodicidade da assinatura — aplica cap de antecipação por ciclo. */
  billingInterval?: string | null;
  now?: Date;
}): BillingWindowDiagnostic {
  const tzRaw = params.tenantTimezoneRaw?.trim() || null;
  const resolved = resolveTenantBillingPreferences({
    timezone: tzRaw,
    recurring_generate_time_local: params.recurringGenerateTimeLocalRaw ?? null,
    invoice_notify_same_as_generation: params.invoiceNotifySameAsGenerationRaw ?? null,
    invoice_notify_time_local: params.invoiceNotifyTimeLocalRaw ?? null,
    recurring_invoice_generate_days_before_due: null,
    recurring_invoice_generate_days_before_due_weekly: null,
  });

  const local = localNowParts(params.now ?? new Date(), resolved.timezone_effective);
  const generate_time_local_effective = resolved.recurring_generate_time_local_effective;
  const generate_time_source = resolved.recurring_generate_time_source;
  const timezone_effective = resolved.timezone_effective;
  const timezone_source = resolved.timezone_source;
  const timezone_valid = resolved.timezone_valid;
  const fallback_applied = resolved.timezone_source === 'fallback_default';

  const cycleYmd = params.nextBillingDate.trim().slice(0, 10);
  const billing_interval_effective = (params.billingInterval ?? 'monthly').trim() || 'monthly';
  const daysParams = {
    general: params.recurringInvoiceGenerateDaysBeforeDue,
    weekly: params.recurringInvoiceGenerateDaysBeforeDueWeekly ?? null,
    billingInterval: billing_interval_effective,
  };
  const { tenantRaw } = resolveTenantGenerateDaysBeforeDueRaw(daysParams);
  const recurring_generate_days_before_due_tenant = tenantRaw;
  const recurring_generate_days_before_due = effectiveRecurringGenerateDaysBeforeDue(daysParams);
  const generate_days_capped_for_interval = isGenerateDaysBeforeCappedForTenant(daysParams);
  const generation_date_ymd = computeRecurringInvoiceGenerationDateYmd(cycleYmd, recurring_generate_days_before_due);

  let would_be_eligible_by_window = false;
  let reason: BillingWindowReason;

  // Sprint 1: exigir H em *todos* os dias com local_ymd >= generation_date
  // (antes só no dia de geração — catch-up às 00:01 ficava elegível).
  if (local.ymd < generation_date_ymd) {
    reason = 'future_local_date';
    would_be_eligible_by_window = false;
  } else if (compareHhMm(local.hhmm, generate_time_local_effective) < 0) {
    reason = 'too_early_local_time';
    would_be_eligible_by_window = false;
  } else {
    reason = fallback_applied ? 'timezone_fallback_applied' : 'eligible_by_window';
    would_be_eligible_by_window = true;
  }

  return {
    tenant_timezone_raw: tzRaw,
    timezone_effective,
    timezone_source,
    timezone_valid,
    fallback_applied,
    generate_time_local_effective,
    generate_time_source,
    local_now_ymd: local.ymd,
    local_now_hhmm: local.hhmm,
    next_billing_date: cycleYmd,
    generation_date_ymd,
    recurring_generate_days_before_due,
    recurring_generate_days_before_due_tenant,
    generate_days_capped_for_interval,
    billing_interval_effective,
    would_be_eligible_by_window,
    reason,
    phase: 'window_runtime_phase2',
  };
}

