/**
 * Datas civis (coluna DATE / vencimento) sem usar o dia em UTC (`toISOString().slice` desloca o calendário).
 */

export function yyyyMmDdFromDbDateValue(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const mo = value.getMonth() + 1;
    const day = value.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

export function formatYmdToPtBr(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return ymd.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || day < 1 || day > 31) return ymd.trim();
  return `${String(day).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`;
}

/** Vencimento tenant_billing / merge WhatsApp — dd/MM/yyyy alinhado ao front (data civil). */
export function formatBillingDueDatePtBr(value: string | Date | null | undefined): string {
  const ymd = yyyyMmDdFromDbDateValue(value);
  return ymd ? formatYmdToPtBr(ymd) : '';
}
