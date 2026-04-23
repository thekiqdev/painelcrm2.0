import { format } from "date-fns";

/**
 * PostgreSQL `DATE` costuma vir na API como ISO com `T00:00:00.000Z`.
 * `new Date(iso)` interpreta como meia-noite UTC → em fusos como América/São Paulo o dia civil exibido recua.
 * Estas funções tratam o prefixo `YYYY-MM-DD` como data civil no fuso local.
 */
const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseApiDateOnlyToLocalDate(raw: string | null | undefined): Date | null {
  if (raw == null || !String(raw).trim()) return null;
  const m = DATE_ONLY_PREFIX.exec(String(raw).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatDateOnlyPtBr(raw: string | null | undefined): string {
  const dt = parseApiDateOnlyToLocalDate(raw);
  if (!dt) return "—";
  return format(dt, "dd/MM/yyyy");
}

/** Valor para `<input type="date" />` a partir da resposta da API. */
export function formatDateOnlyIsoInput(raw: string | null | undefined): string {
  const dt = parseApiDateOnlyToLocalDate(raw);
  if (!dt) return "";
  return format(dt, "yyyy-MM-dd");
}
