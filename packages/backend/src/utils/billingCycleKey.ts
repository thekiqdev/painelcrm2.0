/** Utilitários de chave de ciclo YYYY-MM-DD (compartilhados worker + renewal engine). */

import { normalizeBillingDateOrEmpty } from './billingSafeDate.js';

export const YMD_STRICT = /^\d{4}-\d{2}-\d{2}$/;

/** Cabeçalho típico de `Date.prototype.toString()` — nunca persistir em `::date`. */
export const JS_DATE_STRING_HEAD_RE = /^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}/;

/**
 * Formato canónico persistido em `billing_recurring_jobs.cycle_key`: **YYYY-MM-DD** (texto).
 * Delega a `normalizeBillingDate()` — nunca devolve os primeiros 10 chars de `Date.toString()`.
 */
export function normalizeBillingCycleKeyYmd(raw: string | null | undefined): string {
  return normalizeBillingDateOrEmpty(raw);
}

/** Alias para `next_billing_date` / campos de assinatura (mesma regra de normalização). */
export function normalizeSubscriptionNextBillingYmd(value: unknown): string {
  return normalizeBillingDateOrEmpty(value);
}
