/**
 * B0.2.3 — Trace forense do ciclo de vida de `billing_recurring_jobs`.
 * Somente observabilidade: não altera regras de negócio nem SQL existente.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isBillingJobLifecycleTraceEnabled } from '../config/billingEnv.js';

export type BillingJobSnapshot = {
  job_id: string | null;
  subscription_id: string | null;
  status: string | null;
  retry_at: string | null;
  scheduled_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  attempts: number | null;
  max_attempts: number | null;
  completion_outcome: string | null;
  updated_at: string | null;
  error_message: string | null;
};

export type BillingJobTraceCaller = {
  file: string;
  line: number;
  function: string;
};

export type BillingJobTraceContext = {
  correlation_id: string;
  worker_id: string | null;
  subscription_id: string | null;
  job_id: string | null;
  execution_mode: string;
};

type TraceDb = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows?: unknown[]; rowCount?: number | null }>;
};

const traceContextStorage = new AsyncLocalStorage<BillingJobTraceContext>();

const SNAPSHOT_SQL = `SELECT id::text AS job_id,
       subscription_id::text AS subscription_id,
       status::text AS status,
       retry_at::text AS retry_at,
       scheduled_at::text AS scheduled_at,
       locked_at::text AS locked_at,
       locked_by::text AS locked_by,
       attempts::int AS attempts,
       max_attempts::int AS max_attempts,
       completion_outcome::text AS completion_outcome,
       updated_at::text AS updated_at,
       error_message::text AS error_message
  FROM billing_recurring_jobs
 WHERE id = $1::uuid
 LIMIT 1`;

function nowIso(): string {
  return new Date().toISOString();
}

function basePayload(
  event: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const ctx = traceContextStorage.getStore();
  return {
    ts: nowIso(),
    event,
    correlation_id: ctx?.correlation_id ?? null,
    worker_id: ctx?.worker_id ?? null,
    subscription_id: ctx?.subscription_id ?? null,
    job_id: ctx?.job_id ?? null,
    execution_mode: ctx?.execution_mode ?? null,
    ...extra,
  };
}

export function emitBillingJobTrace(event: string, fields: Record<string, unknown> = {}): void {
  if (!isBillingJobLifecycleTraceEnabled()) return;
  console.log('[BILLING_JOB_TRACE]', JSON.stringify(basePayload(event, fields)));
}

export function getBillingJobTraceContext(): BillingJobTraceContext | undefined {
  return traceContextStorage.getStore();
}

export function runWithBillingJobTraceContext<T>(
  ctx: BillingJobTraceContext,
  fn: () => Promise<T>
): Promise<T> {
  if (!isBillingJobLifecycleTraceEnabled()) return fn();
  return traceContextStorage.run({ ...ctx }, fn);
}

export function patchBillingJobTraceContext(patch: Partial<BillingJobTraceContext>): void {
  const store = traceContextStorage.getStore();
  if (!store) return;
  Object.assign(store, patch);
}

export async function loadBillingJobSnapshot(
  db: TraceDb,
  jobId: string
): Promise<BillingJobSnapshot | null> {
  if (!isBillingJobLifecycleTraceEnabled()) return null;
  const r = await db.query(SNAPSHOT_SQL, [jobId]);
  const row = (r.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!row?.job_id) return null;
  return {
    job_id: String(row.job_id),
    subscription_id: row.subscription_id != null ? String(row.subscription_id) : null,
    status: row.status != null ? String(row.status) : null,
    retry_at: row.retry_at != null ? String(row.retry_at) : null,
    scheduled_at: row.scheduled_at != null ? String(row.scheduled_at) : null,
    locked_at: row.locked_at != null ? String(row.locked_at) : null,
    locked_by: row.locked_by != null ? String(row.locked_by) : null,
    attempts: row.attempts != null ? Number(row.attempts) : null,
    max_attempts: row.max_attempts != null ? Number(row.max_attempts) : null,
    completion_outcome: row.completion_outcome != null ? String(row.completion_outcome) : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
  };
}

function snapshotDiffFields(
  before: BillingJobSnapshot | null,
  after: BillingJobSnapshot | null
): Record<string, unknown> {
  const lockedBefore = before?.locked_by ?? null;
  const lockedAfter = after?.locked_by ?? null;
  return {
    snapshot_before: before,
    snapshot_after: after,
    retry_before: before?.retry_at ?? null,
    retry_after: after?.retry_at ?? null,
    locked_before: before?.locked_at ?? null,
    locked_after: after?.locked_at ?? null,
    locked_by_before: lockedBefore,
    locked_by_after: lockedAfter,
    worker_previous: lockedBefore,
    worker_current: lockedAfter,
    old_status: before?.status ?? null,
    new_status: after?.status ?? null,
    status_changed: Boolean(before && after && before.status !== after.status),
    retry_changed: (before?.retry_at ?? null) !== (after?.retry_at ?? null),
    lock_changed:
      (before?.locked_at ?? null) !== (after?.locked_at ?? null) ||
      (before?.locked_by ?? null) !== (after?.locked_by ?? null),
  };
}

/** Marca de fase sem mutação SQL. */
export function traceBillingJobPhase(
  phase: string,
  fields: Record<string, unknown> = {},
  caller?: BillingJobTraceCaller
): void {
  emitBillingJobTrace(phase, {
    ...(caller ? { caller_file: caller.file, caller_line: caller.line, caller_function: caller.function } : {}),
    ...fields,
  });
}

export async function traceBillingJobMutation(opts: {
  db: TraceDb;
  jobId: string | null;
  subscriptionId?: string | null;
  phase: string;
  operation: 'UPDATE' | 'INSERT' | 'DELETE';
  sql: string;
  binds?: unknown[];
  whereHint?: string;
  expectedStatus?: string | null;
  caller: BillingJobTraceCaller;
  execute: () => Promise<unknown>;
}): Promise<void> {
  if (!isBillingJobLifecycleTraceEnabled()) {
    await opts.execute();
    return;
  }

  if (opts.jobId) {
    patchBillingJobTraceContext({ job_id: opts.jobId });
  }
  if (opts.subscriptionId) {
    patchBillingJobTraceContext({ subscription_id: opts.subscriptionId });
  }

  const started = Date.now();
  const before = opts.jobId ? await loadBillingJobSnapshot(opts.db, opts.jobId) : null;

  const result = await opts.execute();
  const rowsAffected =
    typeof result === 'object' && result !== null && 'rowCount' in result
      ? Number((result as { rowCount?: number | null }).rowCount ?? 0)
      : 0;
  const duration_ms = Date.now() - started;
  const after = opts.jobId ? await loadBillingJobSnapshot(opts.db, opts.jobId) : null;
  const diff = snapshotDiffFields(before, after);

  emitBillingJobTrace(opts.phase, {
    operation: opts.operation,
    sql: opts.sql.trim(),
    binds: opts.binds ?? [],
    rows_affected: rowsAffected,
    duration_ms,
    where_hint: opts.whereHint ?? null,
    expected_status: opts.expectedStatus ?? null,
    caller_file: opts.caller.file,
    caller_line: opts.caller.line,
    caller_function: opts.caller.function,
    ...diff,
  });

  if (opts.operation === 'UPDATE' && rowsAffected === 0) {
    emitBillingJobTrace('warning', {
      warning: 'update_without_effect',
      phase: opts.phase,
      job_id: opts.jobId,
      status_found: before?.status ?? null,
      status_expected: opts.expectedStatus ?? null,
      where_hint: opts.whereHint ?? null,
      sql: opts.sql.trim(),
      binds: opts.binds ?? [],
      caller_file: opts.caller.file,
      caller_line: opts.caller.line,
      caller_function: opts.caller.function,
    });
  }

  if (diff.status_changed) {
    emitBillingJobTrace('status_transition', {
      phase: opts.phase,
      old_status: diff.old_status,
      new_status: diff.new_status,
      caller_file: opts.caller.file,
      caller_line: opts.caller.line,
      caller_function: opts.caller.function,
    });
  }

  if (diff.retry_changed) {
    emitBillingJobTrace('retry_at_changed', {
      phase: opts.phase,
      retry_before: diff.retry_before,
      retry_after: diff.retry_after,
      caller_file: opts.caller.file,
      caller_line: opts.caller.line,
      caller_function: opts.caller.function,
    });
  }

  if (diff.lock_changed) {
    emitBillingJobTrace('lock_changed', {
      phase: opts.phase,
      locked_before: diff.locked_before,
      locked_after: diff.locked_after,
      locked_by_before: diff.locked_by_before,
      locked_by_after: diff.locked_by_after,
      caller_file: opts.caller.file,
      caller_line: opts.caller.line,
      caller_function: opts.caller.function,
    });
  }
}

export function traceBillingJobSelect(opts: {
  phase: string;
  sql: string;
  binds?: unknown[];
  rows: Array<{
    id: string;
    status?: string;
    retry_at?: string | null;
    locked_at?: string | null;
    locked_by?: string | null;
    subscription_id?: string;
  }>;
  forUpdate: boolean;
  duration_ms?: number;
  caller: BillingJobTraceCaller;
}): void {
  if (!isBillingJobLifecycleTraceEnabled()) return;

  const found = opts.rows.length > 0;
  emitBillingJobTrace(opts.phase, {
    operation: 'SELECT',
    for_update: opts.forUpdate,
    sql: opts.sql.trim(),
    binds: opts.binds ?? [],
    row_count: opts.rows.length,
    job_found: found,
    duration_ms: opts.duration_ms ?? null,
    caller_file: opts.caller.file,
    caller_line: opts.caller.line,
    caller_function: opts.caller.function,
    jobs: opts.rows.map((r) => ({
      job_id: r.id,
      status: r.status ?? null,
      retry_at: r.retry_at ?? null,
      locked_at: r.locked_at ?? null,
      locked_by: r.locked_by ?? null,
      subscription_id: r.subscription_id ?? null,
    })),
  });

  if (!found) {
    traceEngineNotReached('select_returned_zero_rows', {
      phase: opts.phase,
      caller: opts.caller,
    });
  }
}

export function traceEngineStart(fields: Record<string, unknown>): void {
  emitBillingJobTrace('ENGINE_START', fields);
}

export function traceEngineFinish(fields: Record<string, unknown>): void {
  emitBillingJobTrace('ENGINE_FINISH', fields);
}

export function traceEngineNotReached(
  reason: string,
  extra: Record<string, unknown> & { caller?: BillingJobTraceCaller } = {}
): void {
  const { caller, ...rest } = extra;
  emitBillingJobTrace('ENGINE_NOT_REACHED', {
    reason,
    ...(caller
      ? {
          caller_file: caller.file,
          caller_line: caller.line,
          caller_function: caller.function,
        }
      : {}),
    ...rest,
  });
}
