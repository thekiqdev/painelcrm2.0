/**
 * Ciclo de fatura do cartão: mês de referência (primeiro dia), fechamento e vencimento.
 * Compras até o dia de fechamento (inclusive) entram na fatura do mês; depois, na seguinte.
 * Datas em calendário local (YYYY-MM-DD).
 */

export function localDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

export function ymdFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** m1to12: 1 = janeiro … 12 = dezembro */
export function daysInMonthCal(y: number, m1to12: number): number {
  return new Date(y, m1to12, 0).getDate();
}

/**
 * Primeiro dia do mês de referência da fatura (YYYY-MM-01) para uma compra.
 */
export function statementMonthFirstDayFromPurchase(purchaseYmd: string, closingDay: number): string {
  const dt = localDateFromYmd(purchaseYmd);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const dim = daysInMonthCal(y, m);
  const cap = Math.min(closingDay, dim);
  if (d <= cap) {
    return `${y}-${String(m).padStart(2, '0')}-01`;
  }
  const next = new Date(y, dt.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
}

export function addMonthsFirstDay(statementMonthYmd: string, add: number): string {
  const d = localDateFromYmd(statementMonthYmd.slice(0, 10));
  const nd = new Date(d.getFullYear(), d.getMonth() + add, 1);
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
}

export function closingYmdForStatementMonth(statementMonthYmd: string, closingDay: number): string {
  const [y, m1] = statementMonthYmd.slice(0, 10).split('-').map(Number);
  const dim = daysInMonthCal(y, m1);
  const d = Math.min(closingDay, dim);
  return `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Vencimento no mês seguinte ao mês de referência da fatura. */
export function dueYmdForStatementMonth(statementMonthYmd: string, dueDay: number): string {
  const [y, m1] = statementMonthYmd.slice(0, 10).split('-').map(Number);
  const nextM = m1 === 12 ? 1 : m1 + 1;
  const nextY = m1 === 12 ? y + 1 : y;
  const dim = daysInMonthCal(nextY, nextM);
  const d = Math.min(dueDay, dim);
  return `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function splitTotalIntoInstallments(totalCents: number, n: number): number[] {
  if (n < 1) return [];
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  const arr = Array.from({ length: n }, () => base);
  arr[n - 1] = (arr[n - 1] ?? 0) + rem;
  return arr;
}
