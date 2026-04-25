const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export type FinancePeriodMode = "month" | "quarter" | "year";

export interface PeriodBucket {
  from: string;
  to: string;
  label: string;
}

/** Retorna intervalo global [from, to] e rótulo amigável para o preset. */
export function overallRange(
  mode: FinancePeriodMode,
  year: number,
  month: number,
  quarter: number
): { from: string; to: string; label: string } {
  if (mode === "month") {
    const from = `${year}-${pad2(month)}-01`;
    const to = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
    return { from, to, label: `${MONTHS_PT[month - 1]}/${year}` };
  }
  if (mode === "quarter") {
    const startM = (quarter - 1) * 3 + 1;
    const endM = quarter * 3;
    const from = `${year}-${pad2(startM)}-01`;
    const to = `${year}-${pad2(endM)}-${pad2(daysInMonth(year, endM))}`;
    return { from, to, label: `T${quarter} ${year}` };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Ano ${year}` };
}

/** Colunas do gráfico (cada bucket tem from/to inclusivos). */
export function chartBuckets(
  mode: FinancePeriodMode,
  year: number,
  month: number,
  quarter: number
): PeriodBucket[] {
  if (mode === "month") {
    const { from, to, label } = overallRange("month", year, month, quarter);
    return [{ from, to, label }];
  }
  if (mode === "quarter") {
    const startM = (quarter - 1) * 3 + 1;
    return [0, 1, 2].map((i) => {
      const mm = startM + i;
      const from = `${year}-${pad2(mm)}-01`;
      const to = `${year}-${pad2(mm)}-${pad2(daysInMonth(year, mm))}`;
      return { from, to, label: MONTHS_PT[mm - 1] };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mm = i + 1;
    const from = `${year}-${pad2(mm)}-01`;
    const to = `${year}-${pad2(mm)}-${pad2(daysInMonth(year, mm))}`;
    return { from, to, label: MONTHS_PT[i] };
  });
}

export function dateInRange(d: string, from: string, to: string): boolean {
  const x = d.slice(0, 10);
  return x >= from && x <= to;
}
