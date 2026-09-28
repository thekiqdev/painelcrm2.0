/**
 * Datas para despesas recorrentes (UTC, formato YYYY-MM-DD).
 */
export type RecurringPeriodicity = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export function todayYmdUTC(): string {
  const d = new Date();
  return ymdFromUtcDate(d);
}

export function ymdFromUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function utcDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function compareYmd(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function maxYmd(a: string, b: string): string {
  return compareYmd(a, b) >= 0 ? a : b;
}

export function minYmd(a: string, b: string): string {
  return compareYmd(a, b) <= 0 ? a : b;
}

function daysInMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Define o dia no mês/ano (month0 = 0..11), limitado ao último dia do mês. */
export function ymdWithDayInMonth(year: number, month0: number, day: number): string {
  const last = daysInMonthUTC(year, month0);
  const d = Math.min(day, last);
  const m = String(month0 + 1).padStart(2, '0');
  const ds = String(d).padStart(2, '0');
  return `${year}-${m}-${ds}`;
}

export function addUtcDays(ymd: string, days: number): string {
  const t = utcDateFromYmd(ymd).getTime() + days * 86400000;
  return ymdFromUtcDate(new Date(t));
}

/** Avança meses de calendário mantendo o dia o mais próximo possível (ex.: 31 Jan +1m → 28/29 Fev). */
export function addCalendarMonthsPlain(ymd: string, monthsToAdd: number): string {
  const d = utcDateFromYmd(ymd);
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth() + monthsToAdd;
  const nd = new Date(Date.UTC(y, m0, 1));
  const last = daysInMonthUTC(nd.getUTCFullYear(), nd.getUTCMonth());
  const day = Math.min(d.getUTCDate(), last);
  nd.setUTCDate(day);
  return ymdFromUtcDate(nd);
}

/** Avança meses mantendo due_day (1–31) dentro do mês destino. */
export function addCalendarMonthsWithDueDay(ymd: string, monthsToAdd: number, dueDay: number): string {
  const base = utcDateFromYmd(ymd);
  let y = base.getUTCFullYear();
  let m0 = base.getUTCMonth() + monthsToAdd;
  y += Math.floor(m0 / 12);
  m0 = ((m0 % 12) + 12) % 12;
  return ymdWithDayInMonth(y, m0, dueDay);
}

/** 1=seg … 7=dom (domingo=7) → getUTCDay() JS (0=dom). */
export function userWeekdayToJs(dueDay1to7: number): number {
  return dueDay1to7 === 7 ? 0 : dueDay1to7;
}

export function firstWeeklyDueOnOrAfter(startYmd: string, dueDay1to7: number): string {
  const target = userWeekdayToJs(dueDay1to7);
  let d = utcDateFromYmd(startYmd);
  for (let i = 0; i < 400; i++) {
    if (d.getUTCDay() === target && ymdFromUtcDate(d) >= startYmd) {
      return ymdFromUtcDate(d);
    }
    d = new Date(d.getTime() + 86400000);
  }
  return startYmd;
}

export function firstMonthlyDueOnOrAfter(startYmd: string, dueDay: number): string {
  const d0 = utcDateFromYmd(startYmd);
  let y = d0.getUTCFullYear();
  let m0 = d0.getUTCMonth();
  let cand = ymdWithDayInMonth(y, m0, dueDay);
  if (compareYmd(cand, startYmd) >= 0) return cand;
  return addCalendarMonthsWithDueDay(cand, 1, dueDay);
}

export function firstDueOnOrAfter(
  startYmd: string,
  periodicity: RecurringPeriodicity,
  dueDay: number
): string {
  if (periodicity === 'weekly' || periodicity === 'biweekly') {
    return firstWeeklyDueOnOrAfter(startYmd, dueDay);
  }
  return firstMonthlyDueOnOrAfter(startYmd, dueDay);
}

export function advanceDueDate(
  currentYmd: string,
  periodicity: RecurringPeriodicity,
  dueDay: number
): string {
  switch (periodicity) {
    case 'weekly':
      return addUtcDays(currentYmd, 7);
    case 'biweekly':
      return addUtcDays(currentYmd, 14);
    case 'monthly':
      return addCalendarMonthsWithDueDay(currentYmd, 1, dueDay);
    case 'quarterly':
      return addCalendarMonthsWithDueDay(currentYmd, 3, dueDay);
    case 'semiannual':
      return addCalendarMonthsWithDueDay(currentYmd, 6, dueDay);
    case 'annual':
      return addCalendarMonthsWithDueDay(currentYmd, 12, dueDay);
    default:
      return addCalendarMonthsWithDueDay(currentYmd, 1, dueDay);
  }
}

/** Gera lista de datas de vencimento (inclusivo), respeitando fim, horizonte e limite de ocorrências. */
export function generateDueDates(params: {
  startYmd: string;
  endYmd: string | null;
  periodicity: RecurringPeriodicity;
  dueDay: number;
  scheduleType: 'infinite' | 'finite';
  maxOccurrences: number | null;
  horizonEndYmd: string;
}): string[] {
  const { startYmd, endYmd, periodicity, dueDay, scheduleType, maxOccurrences, horizonEndYmd } = params;
  const capEnd = endYmd ? minYmd(horizonEndYmd, endYmd) : horizonEndYmd;
  let cur = firstDueOnOrAfter(startYmd, periodicity, dueDay);
  if (compareYmd(cur, capEnd) > 0) return [];

  const out: string[] = [];
  const maxN = scheduleType === 'finite' && maxOccurrences != null ? maxOccurrences : 10_000;

  while (out.length < maxN && compareYmd(cur, capEnd) <= 0) {
    out.push(cur);
    const next = advanceDueDate(cur, periodicity, dueDay);
    if (next === cur) break;
    cur = next;
  }
  return out;
}
