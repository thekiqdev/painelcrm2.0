/**
 * Datas seguras no motor de renovação (B0.1) — evita "Invalid time value".
 */
import { yyyyMmDdFromDbDateValue } from './calendarDateBr.js';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

/** Normaliza para YYYY-MM-DD ou null se inválido/ausente. */
export function safeParseYmd(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const ymd = yyyyMmDdFromDbDateValue(value);
  if (!ymd || !isValidYmd(ymd)) return null;
  return ymd;
}

/** Date UTC meio-dia para YMD civil; null se inválido. */
export function safeDate(value: string | Date | null | undefined): Date | null {
  const ymd = safeParseYmd(value);
  if (!ymd) return null;
  const [yS, mS, dS] = ymd.split('-');
  const dt = new Date(Date.UTC(parseInt(yS, 10), parseInt(mS, 10) - 1, parseInt(dS, 10), 12, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function safeToISOString(value: string | Date | null | undefined): string | null {
  const dt = safeDate(value);
  return dt ? dt.toISOString() : null;
}

/** Alias explícito para logs/diagnóstico. */
export function safeFormatYmd(value: string | Date | null | undefined): string | null {
  return safeParseYmd(value);
}
