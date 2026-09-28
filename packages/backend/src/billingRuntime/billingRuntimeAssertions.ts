/**
 * Assertions globais de datas/ciclos no billing runtime (Sprint 4.1J).
 * Falham antes do SQL — nunca deixam "Tue Jun 30" chegar ao PostgreSQL.
 */
import { JS_DATE_STRING_HEAD_RE, normalizeBillingDate, normalizeBillingDateOrEmpty } from '../utils/billingSafeDate.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';

export class BillingRuntimeAssertionError extends Error {
  readonly code: string;
  readonly field: string;
  readonly value_received: string;
  readonly caller?: string;

  constructor(params: { code: string; field: string; value: unknown; caller?: string; message?: string }) {
    const raw = params.value == null ? '' : String(params.value);
    super(
      params.message ??
        `Billing runtime assertion failed [${params.code}] field=${params.field} value="${raw.slice(0, 48)}"`
    );
    this.name = 'BillingRuntimeAssertionError';
    this.code = params.code;
    this.field = params.field;
    this.value_received = raw;
    this.caller = params.caller;
  }
}

function callerHint(): string | undefined {
  const stack = new Error().stack ?? '';
  const line = stack.split('\n').find((l) => l.includes('/src/') && !l.includes('billingRuntimeAssertions'));
  return line?.trim().replace(/^at\s+/, '');
}

/** Valor vindo do PG (Date) ou entrada arbitrária → YYYY-MM-DD civil. */
export function normalizeBillingDateFromDb(value: unknown): string | null {
  if (value == null || value === '') return null;
  const fromDb = yyyyMmDdFromDbDateValue(value as string | Date);
  if (fromDb) return fromDb;
  return normalizeBillingDate(value);
}

export function assertBillingDate(
  value: unknown,
  field: string,
  options?: { caller?: string; allowNull?: boolean }
): string {
  if (value == null || value === '') {
    if (options?.allowNull) return '';
    throw new BillingRuntimeAssertionError({
      code: 'billing_date_missing',
      field,
      value,
      caller: options?.caller ?? callerHint(),
    });
  }
  const raw = typeof value === 'string' ? value.trim() : value instanceof Date ? value.toString() : String(value);
  if (JS_DATE_STRING_HEAD_RE.test(raw) && !/\d{4}/.test(raw)) {
    throw new BillingRuntimeAssertionError({
      code: 'billing_date_js_tostring',
      field,
      value: raw,
      caller: options?.caller ?? callerHint(),
      message: `Campo ${field}: formato Date.toString() proibido ("${raw.slice(0, 20)}")`,
    });
  }
  const ymd = normalizeBillingDateFromDb(value) ?? normalizeBillingDate(value);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new BillingRuntimeAssertionError({
      code: 'billing_date_invalid',
      field,
      value,
      caller: options?.caller ?? callerHint(),
    });
  }
  return ymd;
}

export function assertIsoDate(value: unknown, field: string): string {
  const ymd = assertBillingDate(value, field);
  return ymd;
}

export function assertBillingCycle(cycleKey: unknown, field = 'cycle_key'): string {
  return assertBillingDate(cycleKey, field);
}

export function assertPeriod(bounds: { start?: unknown; end?: unknown }): { start: string; end: string } {
  const start = assertBillingDate(bounds.start, 'period_start');
  const end = assertBillingDate(bounds.end, 'period_end');
  if (end < start) {
    throw new BillingRuntimeAssertionError({
      code: 'period_inverted',
      field: 'period_end',
      value: `${start}..${end}`,
    });
  }
  return { start, end };
}

export function assertCycleIntegrity(params: {
  cycle_date: unknown;
  period_start?: unknown;
  period_end?: unknown;
  subscription_id?: string;
}): { cycle_date: string; period_start: string; period_end: string } {
  const cycle_date = assertBillingCycle(params.cycle_date);
  const period_start = params.period_start != null ? assertBillingDate(params.period_start, 'period_start') : cycle_date;
  const period_end =
    params.period_end != null
      ? assertBillingDate(params.period_end, 'period_end')
      : cycle_date;
  if (period_end < period_start) {
    throw new BillingRuntimeAssertionError({
      code: 'cycle_period_invalid',
      field: 'period_end',
      value: { cycle_date, period_start, period_end, subscription_id: params.subscription_id },
    });
  }
  return { cycle_date, period_start, period_end };
}

/** Sanitiza parâmetro SQL de data; lança se inválido. */
export function sanitizeSqlDateParam(value: unknown, field: string, sqlHint?: string): string {
  try {
    return assertBillingDate(value, field, { caller: sqlHint });
  } catch (e) {
    if (e instanceof BillingRuntimeAssertionError) throw e;
    throw new BillingRuntimeAssertionError({ code: 'billing_date_sanitize', field, value });
  }
}

/** Sanitiza sem lançar — retorna null se inválido (para auditoria). */
export function trySanitizeSqlDateParam(value: unknown): {
  original: unknown;
  originalType: string;
  normalized: string | null;
  valid: boolean;
  rejectedReason: string | null;
} {
  const originalType =
    value instanceof Date ? 'Date' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const original = value;
  const raw = value == null ? '' : value instanceof Date ? value.toString() : String(value);
  if (JS_DATE_STRING_HEAD_RE.test(raw.trim()) && !/\d{4}/.test(raw)) {
    return {
      original,
      originalType,
      normalized: null,
      valid: false,
      rejectedReason: 'js_date_tostring_slice',
    };
  }
  const normalized =
    normalizeBillingDateFromDb(value) ?? (normalizeBillingDateOrEmpty(value) || null);
  const valid = normalized != null && /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  return {
    original: originalType === 'Date' ? raw : original,
    originalType,
    normalized: valid ? normalized : null,
    valid,
    rejectedReason: valid ? null : 'invalid_format',
  };
}
