/**
 * Guard de SQL billing — sanitiza datas e grava trace (Sprint 4.1J).
 */
import {
  BillingRuntimeAssertionError,
  sanitizeSqlDateParam,
  trySanitizeSqlDateParam,
} from './billingRuntimeAssertions.js';
import {
  auditSqlDateParams,
  isBillingRuntimeSql,
  traceBillingSqlWrite,
} from './billingRuntimeTrace.js';

const DATE_PARAM_RE = /::date\b|\bcycle_key\b|\bnext_billing_date\b|\bperiod_start\b|\bperiod_end\b|\bcycle_date\b/i;

export function guardBillingQueryParams(
  sql: string,
  values?: unknown[]
): unknown[] | undefined {
  if (!values?.length) return values;
  if (!isBillingRuntimeSql(sql) && !DATE_PARAM_RE.test(sql)) return values;

  const { sanitized, audits } = auditSqlDateParams(sql, values);
  const out = [...(sanitized ?? values)];

  for (const audit of audits ?? []) {
    if (!audit.valid && audit.originalType === 'Date') {
      const normalized = trySanitizeSqlDateParam(audit.original).normalized;
      if (normalized) {
        out[audit.param_index] = normalized;
        continue;
      }
      throw new BillingRuntimeAssertionError({
        code: 'sql_date_guard_blocked',
        field: `param_$${audit.param_index + 1}`,
        value: audit.original,
        message: `SQL bloqueado: parâmetro de data inválido (índice ${audit.param_index}) — origem provável String(Date).slice(0,10)`,
      });
    }
    if (!audit.valid && typeof audit.original === 'string' && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(audit.original)) {
      throw new BillingRuntimeAssertionError({
        code: 'sql_date_tue_jun_30',
        field: `param_$${audit.param_index + 1}`,
        value: audit.original,
        message: `SQL bloqueado: "${String(audit.original).slice(0, 12)}" — formato Date.toString() detectado`,
      });
    }
  }

  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (p instanceof Date) {
      out[i] = sanitizeSqlDateParam(p, `sql_param_${i}`, sql.slice(0, 80));
    }
  }

  traceBillingSqlWrite(sql, out);
  return out;
}

export { BillingRuntimeAssertionError };
