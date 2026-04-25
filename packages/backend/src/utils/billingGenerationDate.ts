/** Limite superior de antecipação (alinhado ao CHECK em `tenants`). */
export const BILLING_RECURRING_GENERATE_DAYS_MAX = 60;

export function clampRecurringInvoiceGenerateDaysBeforeDue(raw: unknown): number {
  if (raw == null) return 0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return Math.min(Math.max(t, 0), BILLING_RECURRING_GENERATE_DAYS_MAX);
}

/**
 * Subtrai N dias civilmente a partir de YYYY-MM-DD (equivalente a `date - integer` no PostgreSQL).
 */
export function subtractCalendarDaysFromIsoYmd(ymd: string, days: number): string {
  const d = Math.max(0, Math.floor(days));
  const head = ymd.trim().slice(0, 10);
  const [yS, mS, daS] = head.split('-');
  const y = parseInt(yS, 10);
  const m = parseInt(mS, 10) - 1;
  const da = parseInt(daS, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(da)) {
    return head;
  }
  const dt = new Date(Date.UTC(y, m, da));
  dt.setUTCDate(dt.getUTCDate() - d);
  return dt.toISOString().slice(0, 10);
}

export function computeRecurringInvoiceGenerationDateYmd(cycleDueYmd: string, daysBeforeDue: number): string {
  const clamped = clampRecurringInvoiceGenerateDaysBeforeDue(daysBeforeDue);
  return subtractCalendarDaysFromIsoYmd(cycleDueYmd, clamped);
}
