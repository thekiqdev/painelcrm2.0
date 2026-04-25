/** Espelha a lógica de `packages/backend/src/utils/billingGenerationDate.ts` para pré-visualização na UI. */

export const RECURRING_GENERATE_DAYS_MAX = 60;

export function clampRecurringGenerateDaysBeforeDue(raw: unknown): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return Math.min(Math.max(t, 0), RECURRING_GENERATE_DAYS_MAX);
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
