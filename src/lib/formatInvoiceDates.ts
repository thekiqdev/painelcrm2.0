/**
 * Formatação segura de datas de fatura (evita Invalid Date com ISO ou strings mistas).
 * Datas só dia (YYYY-MM-DD) usam componentes locais — evita deslocar um dia vs. `new Date('YYYY-MM-DD')` em UTC.
 */

/** YYYY-MM-DD (prefixo) ou instante ISO — dd/MM/yyyy; instantes usam fuso America/Sao_Paulo. */
export function formatDateYmdOrInstantPtBr(input: string | null | undefined): string {
  if (input == null || typeof input !== "string") return "—";
  const trimmed = input.trim();
  if (!trimmed) return "—";
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
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  }
  return "—";
}

export function formatInvoiceDueDatePtBr(due: string | null | undefined): string {
  return formatDateYmdOrInstantPtBr(due);
}
