/**
 * Datas seguras na UI de cobranças recorrentes (BILLING V2 Fase 1).
 * Evita RangeError: Invalid time value do date-fns.
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DEFAULT_FINANCIAL_TIMEZONE = 'America/Sao_Paulo';

export function resolveFinancialTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  if (!tz) return DEFAULT_FINANCIAL_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_FINANCIAL_TIMEZONE;
  }
}

/** Data civil de hoje no fuso da conta (YYYY-MM-DD). */
export function financialTodayYmd(timeZone?: string | null): string {
  const tz = resolveFinancialTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function isValidYmd(ymd: string): boolean {
  const m = YMD_RE.exec(ymd.trim().slice(0, 10));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === day;
}

export function safeParseYmd(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const head = value.trim().slice(0, 10);
  return isValidYmd(head) ? head : null;
}

/** Formata YYYY-MM-DD em pt-BR; nunca lança Invalid time value. */
export function formatYmdBrSafe(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const parsed = safeParseYmd(ymd);
  if (!parsed) return ymd.slice(0, 10);
  const d = safeDate(parsed);
  if (!d) return parsed;
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/** Formata ISO datetime em pt-BR no fuso da conta; nunca lança. */
export function formatDateTimeBrSafe(
  iso: string | null | undefined,
  timeZone?: string | null
): string {
  if (!iso) return '—';
  const tz = resolveFinancialTimeZone(timeZone);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(',', ' às');
}

/** Date UTC meio-dia para YMD; null se inválido. */
export function safeDate(value: string | null | undefined): Date | null {
  const ymd = safeParseYmd(value);
  if (!ymd) {
    const d = new Date(value ?? '');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function safeToISOString(value: string | null | undefined): string | null {
  const d = safeDate(value);
  return d ? d.toISOString() : null;
}

export function formatYmdBrShortSafe(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const parsed = safeParseYmd(ymd);
  if (!parsed) return ymd.slice(0, 10);
  const d = safeDate(parsed);
  if (!d) return parsed;
  return format(d, 'dd/MM/yy', { locale: ptBR });
}

export function safeNowIso(): string {
  return new Date().toISOString();
}
