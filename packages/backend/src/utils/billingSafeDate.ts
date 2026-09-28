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

/** Timestamp ISO atual — único ponto para logs do motor de billing. */
export function safeNowIso(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD de hoje (UTC) para o motor de billing. */
export function safeTodayYmd(): string {
  return safeNowIso().slice(0, 10);
}

/** Cabeçalho típico de `Date.prototype.toString()` — nunca persistir em `::date`. */
export const JS_DATE_STRING_HEAD_RE = /^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}/;

function ymdFromParseableString(s: string): string | null {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Único normalizador obrigatório para datas no billing (Sprint 4.1I).
 * Aceita: YYYY-MM-DD, ISO8601, Date (converte para ISO).
 * Rejeita: Date.toString(), locale strings, garbage.
 */
export function normalizeBillingDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  const head = s.slice(0, 10);
  if (isValidYmd(head)) return head;
  if (JS_DATE_STRING_HEAD_RE.test(s)) {
    if (!/\d{4}/.test(s)) return null;
    return ymdFromParseableString(s);
  }
  const isoHead = ymdFromParseableString(s);
  if (isoHead && isValidYmd(isoHead)) return isoHead;
  return null;
}

/** Como `normalizeBillingDate`, mas retorna '' em vez de null (chaves de ciclo / SQL). */
export function normalizeBillingDateOrEmpty(value: unknown): string {
  return normalizeBillingDate(value) ?? '';
}

/** Alias explícito para logs/diagnóstico. */
export function safeFormatYmd(value: string | Date | null | undefined): string | null {
  return safeParseYmd(value);
}

export type BillingDateFieldContext = {
  field: string;
  value_received: string | null;
  subscription_id?: string | null;
  invoice_id?: string | null;
  cycle_key?: string | null;
};

/** Erro de data com contexto — nunca expor "Invalid time value" cru. */
export class BillingDateParseError extends Error {
  readonly reason_code = 'invalid_date';
  readonly field: string;
  readonly value_received: string | null;
  readonly subscription_id: string | null;
  readonly invoice_id: string | null;
  readonly cycle_key: string | null;

  constructor(ctx: BillingDateFieldContext) {
    super(
      `Data inválida no campo ${ctx.field}: valor="${String(ctx.value_received ?? '').slice(0, 40)}"`
    );
    this.name = 'BillingDateParseError';
    this.field = ctx.field;
    this.value_received = ctx.value_received ?? null;
    this.subscription_id = ctx.subscription_id ?? null;
    this.invoice_id = ctx.invoice_id ?? null;
    this.cycle_key = ctx.cycle_key ?? null;
  }
}

/** Exige YMD válido ou lança BillingDateParseError com contexto. */
export function requireYmd(value: string | null | undefined, ctx: BillingDateFieldContext): string {
  const ymd = safeParseYmd(value);
  if (!ymd) throw new BillingDateParseError({ ...ctx, value_received: value ?? null });
  return ymd;
}
