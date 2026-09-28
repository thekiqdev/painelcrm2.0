/** Espelha `packages/backend/src/utils/billingGenerationDate.ts` + `billingIntervalGenerationCap.ts` (Sprint 5.3). */

export const RECURRING_GENERATE_DAYS_MAX = 60;

export function clampRecurringGenerateDaysBeforeDue(raw: unknown): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return Math.min(Math.max(t, 0), RECURRING_GENERATE_DAYS_MAX);
}

/** Duração civil aproximada de cada periodicidade (dias) — espelho do BE. */
const BILLING_INTERVAL_CYCLE_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 31,
  quarterly: 93,
  semi_annual: 186,
  yearly: 366,
};

/**
 * Máximo de dias de antecipação seguros para a periodicidade (sempre < duração do ciclo).
 */
export function maxRecurringGenerateDaysBeforeForInterval(billingInterval: string): number {
  const key = (billingInterval ?? "monthly").trim() || "monthly";
  const cycleDays = BILLING_INTERVAL_CYCLE_DAYS[key] ?? BILLING_INTERVAL_CYCLE_DAYS.monthly;
  return Math.max(0, cycleDays - 1);
}

export type TenantGenerateDaysBeforeSource = "weekly" | "general";

/**
 * SSOT FE: N bruto do tenant para o intervalo (ainda sem cap).
 * weekly + weeklyCol != null → weekly; senão → geral.
 */
export function resolveTenantGenerateDaysBeforeDueRaw(params: {
  general: unknown;
  weekly?: unknown | null;
  billingInterval: string;
}): { tenantRaw: number; source: TenantGenerateDaysBeforeSource } {
  const interval = (params.billingInterval ?? "monthly").trim() || "monthly";
  const general = clampRecurringGenerateDaysBeforeDue(params.general);

  if (interval === "weekly" && params.weekly != null && params.weekly !== "") {
    const n = typeof params.weekly === "number" ? params.weekly : Number(params.weekly);
    if (Number.isFinite(n)) {
      return {
        tenantRaw: clampRecurringGenerateDaysBeforeDue(n),
        source: "weekly",
      };
    }
  }

  return { tenantRaw: general, source: "general" };
}

/**
 * Valor efetivo usado pelo worker/preview: `min(tenant_raw(interval), cap(intervalo))`.
 */
export function effectiveRecurringGenerateDaysBeforeDue(params: {
  general: unknown;
  weekly?: unknown | null;
  billingInterval: string;
}): number;
export function effectiveRecurringGenerateDaysBeforeDue(
  tenantDaysBefore: unknown,
  billingInterval: string
): number;
export function effectiveRecurringGenerateDaysBeforeDue(
  tenantDaysBeforeOrParams:
    | unknown
    | { general: unknown; weekly?: unknown | null; billingInterval: string },
  billingInterval?: string
): number {
  if (
    tenantDaysBeforeOrParams != null &&
    typeof tenantDaysBeforeOrParams === "object" &&
    !Array.isArray(tenantDaysBeforeOrParams) &&
    "billingInterval" in tenantDaysBeforeOrParams &&
    "general" in tenantDaysBeforeOrParams
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

  const tenant = clampRecurringGenerateDaysBeforeDue(tenantDaysBeforeOrParams);
  const cap = maxRecurringGenerateDaysBeforeForInterval(billingInterval ?? "monthly");
  return Math.min(tenant, cap);
}

/** Atalho a partir de prefs de tenant_billing + intervalo da assinatura. */
export function effectiveDaysBeforeFromTenantBilling(
  tenantBilling: {
    recurring_invoice_generate_days_before_due?: number | null;
    recurring_invoice_generate_days_before_due_weekly?: number | null;
  },
  billingInterval?: string | null
): number {
  return effectiveRecurringGenerateDaysBeforeDue({
    general: tenantBilling.recurring_invoice_generate_days_before_due,
    weekly: tenantBilling.recurring_invoice_generate_days_before_due_weekly ?? null,
    billingInterval: billingInterval ?? "monthly",
  });
}

export function subtractCalendarDaysFromIsoYmd(ymd: string, days: number): string {
  const d = Math.max(0, Math.floor(days));
  const head = ymd.trim().slice(0, 10);
  const [yS, mS, daS] = head.split("-");
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10) - 1;
  const da = parseInt(daS, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(da)) return head;
  const dt = new Date(Date.UTC(y, m, da));
  dt.setUTCDate(dt.getUTCDate() - d);
  return dt.toISOString().slice(0, 10);
}

export function computeRecurringGenerationDateYmd(cycleDueYmd: string, daysBeforeDue: number): string {
  return subtractCalendarDaysFromIsoYmd(cycleDueYmd, clampRecurringGenerateDaysBeforeDue(daysBeforeDue));
}

/** Inverso de `subtractCalendarDaysFromIsoYmd`: vencimento do ciclo = data de geração + dias de antecipação. */
export function addCalendarDaysToIsoYmd(ymd: string, days: number): string {
  const d = Math.max(0, Math.floor(days));
  const head = ymd.trim().slice(0, 10);
  const [yS, mS, daS] = head.split("-");
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10) - 1;
  const da = parseInt(daS, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(da)) return head;
  const dt = new Date(Date.UTC(y, m, da));
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}
