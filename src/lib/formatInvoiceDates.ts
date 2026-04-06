/**
 * Formatação segura de datas de fatura (evita Invalid Date com ISO ou strings mistas).
 */

export function formatInvoiceDueDatePtBr(due: string | null | undefined): string {
  if (due == null || typeof due !== "string") return "—";
  const trimmed = due.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("pt-BR");
    }
  }
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) return new Date(t).toLocaleDateString("pt-BR");
  return "—";
}
