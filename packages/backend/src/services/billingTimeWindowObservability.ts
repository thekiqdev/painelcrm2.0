/**
 * Helper central da janela local por tenant.
 * Na Fase 2 passa a ser usado para decisões reais no scheduler/worker.
 */

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
  next_billing_date: string;
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
  nextBillingDate: string;
  now?: Date;
}): BillingWindowDiagnostic {
  const tzRaw = params.tenantTimezoneRaw?.trim() || null;
  const resolved = resolveTenantBillingPreferences({
    timezone: tzRaw,
    recurring_generate_time_local: params.recurringGenerateTimeLocalRaw ?? null,
    invoice_notify_same_as_generation: params.invoiceNotifySameAsGenerationRaw ?? null,
    invoice_notify_time_local: params.invoiceNotifyTimeLocalRaw ?? null,
  });

  const local = localNowParts(params.now ?? new Date(), resolved.timezone_effective);
  const generate_time_local_effective = resolved.recurring_generate_time_local_effective;
  const generate_time_source = resolved.recurring_generate_time_source;
  const timezone_effective = resolved.timezone_effective;
  const timezone_source = resolved.timezone_source;
  const timezone_valid = resolved.timezone_valid;
  const fallback_applied = resolved.timezone_source === 'fallback_default';

  let would_be_eligible_by_window = false;
  let reason: BillingWindowReason;

  if (params.nextBillingDate > local.ymd) {
    reason = 'future_local_date';
    would_be_eligible_by_window = false;
  } else if (params.nextBillingDate === local.ymd && compareHhMm(local.hhmm, generate_time_local_effective) < 0) {
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
    next_billing_date: params.nextBillingDate,
    would_be_eligible_by_window,
    reason,
    phase: 'window_runtime_phase2',
  };
}

