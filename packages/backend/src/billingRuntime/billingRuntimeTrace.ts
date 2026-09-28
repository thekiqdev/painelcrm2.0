/**
 * Instrumentação de runtime billing (Sprint 4.1J).
 * Grava traces em storage/debug/billing-runtime/ quando BILLING_RUNTIME_TRACE=1.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { trySanitizeSqlDateParam } from './billingRuntimeAssertions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACE_ROOT = path.resolve(__dirname, '../../../../storage/debug/billing-runtime');

const BILLING_TABLE_RE =
  /\b(subscription_cycles|customer_invoices|billing_recurring_jobs|billing_job_audit|billing_logs|billing_plans|billing_plan_items)\b/i;
const DATE_CAST_RE = /::date\b/i;

export type BillingRuntimeTraceEntry = {
  at: string;
  kind: 'sql_write' | 'date_audit' | 'assertion_fail' | 'runtime_repair';
  file?: string;
  function?: string;
  caller?: string;
  stack_summary?: string;
  sql?: string;
  params?: unknown[];
  subscription_id?: string | null;
  tenant_id?: string | null;
  worker_id?: string | null;
  job_id?: string | null;
  request_id?: string | null;
  pipeline?: string;
  stage?: string;
  date_audits?: Array<{
    param_index: number;
    original: unknown;
    originalType: string;
    normalized: string | null;
    valid: boolean;
    rejectedReason: string | null;
  }>;
  meta?: Record<string, unknown>;
};

let sessionFile: string | null = null;
const buffer: BillingRuntimeTraceEntry[] = [];

function traceEnabled(): boolean {
  return process.env.BILLING_RUNTIME_TRACE === '1' || process.env.NODE_ENV !== 'production';
}

function ensureTraceDir(): void {
  if (!fs.existsSync(TRACE_ROOT)) {
    fs.mkdirSync(TRACE_ROOT, { recursive: true });
  }
}

function sessionPath(): string {
  if (!sessionFile) {
    ensureTraceDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    sessionFile = path.join(TRACE_ROOT, `runtime-${ts}.json`);
  }
  return sessionFile;
}

function stackSummary(): string {
  const lines = (new Error().stack ?? '')
    .split('\n')
    .slice(2, 8)
    .map((l) => l.trim())
    .filter((l) => l.includes('/src/'));
  return lines.join(' | ');
}

function flush(): void {
  if (!traceEnabled() || buffer.length === 0) return;
  try {
    ensureTraceDir();
    const file = sessionPath();
    let existing: BillingRuntimeTraceEntry[] = [];
    if (fs.existsSync(file)) {
      existing = JSON.parse(fs.readFileSync(file, 'utf8')) as BillingRuntimeTraceEntry[];
    }
    fs.writeFileSync(file, JSON.stringify([...existing, ...buffer], null, 2), 'utf8');
    buffer.length = 0;
  } catch {
    /* trace nunca bloqueia billing */
  }
}

export function recordBillingRuntimeTrace(entry: Omit<BillingRuntimeTraceEntry, 'at'>): void {
  if (!traceEnabled()) return;
  buffer.push({ at: new Date().toISOString(), ...entry });
  if (buffer.length >= 20) flush();
}

export function auditSqlDateParams(
  sql: string,
  params: unknown[] | undefined,
  context?: { caller?: string; subscription_id?: string; tenant_id?: string; job_id?: string }
): { sanitized: unknown[] | undefined; audits: BillingRuntimeTraceEntry['date_audits'] } {
  if (!params?.length) return { sanitized: params, audits: [] };
  const needsAudit = DATE_CAST_RE.test(sql) || BILLING_TABLE_RE.test(sql);
  if (!needsAudit) return { sanitized: params, audits: [] };

  const audits: NonNullable<BillingRuntimeTraceEntry['date_audits']> = [];
  const sanitized = params.map((p, i) => {
    if (p == null || typeof p === 'number' || typeof p === 'boolean') return p;
    if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.trim())) return p.trim();
    if (p instanceof Date || (typeof p === 'string' && /date|Tue |Mon |Wed |Thu |Fri |Sat |Sun /i.test(p))) {
      const audit = trySanitizeSqlDateParam(p);
      audits.push({ param_index: i, ...audit });
      if (audit.valid && audit.normalized) return audit.normalized;
      return p;
    }
    return p;
  });

  if (audits.length > 0) {
    recordBillingRuntimeTrace({
      kind: 'date_audit',
      caller: context?.caller,
      stack_summary: stackSummary(),
      sql: sql.slice(0, 500),
      params: params.map((p) => (p instanceof Date ? p.toString() : p)),
      subscription_id: context?.subscription_id ?? null,
      tenant_id: context?.tenant_id ?? null,
      job_id: context?.job_id ?? null,
      date_audits: audits,
    });
  }

  return { sanitized, audits };
}

export function isBillingRuntimeSql(sql: string): boolean {
  const upper = sql.toUpperCase();
  if (!/(INSERT|UPDATE|DELETE)\s/i.test(sql)) return false;
  return BILLING_TABLE_RE.test(sql);
}

export function traceBillingSqlWrite(
  sql: string,
  params: unknown[] | undefined,
  context?: Record<string, unknown>
): void {
  if (!traceEnabled() || !isBillingRuntimeSql(sql)) return;
  recordBillingRuntimeTrace({
    kind: 'sql_write',
    stack_summary: stackSummary(),
    sql: sql.slice(0, 800),
    params: params?.map((p) => (p instanceof Date ? `[Date:${p.toISOString()}]` : p)),
    ...context,
  });
  flush();
}

export function getBillingRuntimeTracePath(): string | null {
  return sessionFile;
}

process.on('beforeExit', () => flush());
