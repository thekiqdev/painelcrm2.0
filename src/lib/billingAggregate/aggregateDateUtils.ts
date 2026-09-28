/** Utilitários de data do Aggregate — sem dependência do motor legado. */

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function advanceBillingDueYmd(ymd: string, interval: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [yS, mS, dS] = ymd.split('-');
  const y = parseInt(yS!, 10);
  const m = parseInt(mS!, 10) - 1;
  const d = parseInt(dS!, 10);
  const dt = new Date(Date.UTC(y, m, d));
  switch (interval) {
    case 'weekly':
      dt.setUTCDate(dt.getUTCDate() + 7);
      break;
    case 'monthly':
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      break;
    case 'quarterly':
      dt.setUTCMonth(dt.getUTCMonth() + 3);
      break;
    case 'semi_annual':
      dt.setUTCMonth(dt.getUTCMonth() + 6);
      break;
    case 'yearly':
      dt.setUTCFullYear(dt.getUTCFullYear() + 1);
      break;
    default:
      dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

export function formatEventDateShort(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const day = Number(ymd.slice(8, 10));
  const mi = Number(ymd.slice(5, 7)) - 1;
  return mi >= 0 && mi < 12 ? `${day} ${MONTH_SHORT[mi]}` : ymd;
}

export function formatCentsCompact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(v);
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

/** Status de ciclo elegíveis para geração manual (espelha GENERATABLE do legado). */
export const GENERATABLE_CYCLE_STATUSES = new Set([
  'pending',
  'queued',
  'failed',
  'skipped',
  'cancelled',
]);
