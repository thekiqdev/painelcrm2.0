/**
 * BILLING ENGINE V2 — Fase 1: trace de pipeline com estágios e duração.
 * Prefixo: [RENEWAL_PIPELINE]
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { safeNowIso } from '../utils/billingSafeDate.js';

export type RenewalPipelineStage =
  | 'HTTP_RECEIVED'
  | 'READINESS'
  | 'JOB_RESOLUTION'
  | 'JOB_PICKUP'
  | 'ENGINE_START'
  | 'VALIDATION'
  | 'CUSTOMER'
  | 'DATES'
  | 'CONTRACT'
  | 'PREVIOUS_INVOICE'
  | 'ITEMS'
  | 'CREATE_INVOICE'
  | 'CREATE_ITEMS'
  | 'GATEWAY'
  | 'NOTIFICATIONS'
  | 'TIMELINE'
  | 'HISTORY'
  | 'ADVANCE'
  | 'POST_MANUAL_ENQUEUE_NEXT'
  | 'COMPLETE'
  | 'ERROR';

export type RenewalPipelineContext = {
  correlation_id: string;
  subscription_id: string | null;
  job_id: string | null;
  invoice_id: string | null;
  cycle_key: string | null;
  execution_mode: string;
  started_at_ms: number;
};

type StageRecord = {
  stage: RenewalPipelineStage;
  started_at_ms: number;
  duration_ms?: number;
  ok: boolean;
  fields?: Record<string, unknown>;
};

const ctxStorage = new AsyncLocalStorage<RenewalPipelineContext>();
const stagesStorage = new AsyncLocalStorage<StageRecord[]>();

function nowMs(): number {
  return Date.now();
}

export function runWithRenewalPipeline<T>(
  ctx: Omit<RenewalPipelineContext, 'started_at_ms'> & { started_at_ms?: number },
  fn: () => Promise<T>
): Promise<T> {
  const full: RenewalPipelineContext = {
    ...ctx,
    started_at_ms: ctx.started_at_ms ?? nowMs(),
  };
  return ctxStorage.run(full, () => stagesStorage.run([], fn));
}

export function getRenewalPipelineContext(): RenewalPipelineContext | undefined {
  return ctxStorage.getStore();
}

export function patchRenewalPipelineContext(patch: Partial<RenewalPipelineContext>): void {
  const store = ctxStorage.getStore();
  if (store) Object.assign(store, patch);
}

function emit(stage: RenewalPipelineStage, payload: Record<string, unknown>): void {
  const ctx = ctxStorage.getStore();
  console.log(
    '[RENEWAL_PIPELINE]',
    JSON.stringify({
      ts: safeNowIso(),
      stage,
      correlation_id: ctx?.correlation_id ?? payload.correlation_id ?? null,
      subscription_id: ctx?.subscription_id ?? payload.subscription_id ?? null,
      job_id: ctx?.job_id ?? payload.job_id ?? null,
      invoice_id: ctx?.invoice_id ?? payload.invoice_id ?? null,
      cycle_key: ctx?.cycle_key ?? payload.cycle_key ?? null,
      execution_mode: ctx?.execution_mode ?? payload.execution_mode ?? null,
      pipeline_elapsed_ms: ctx ? nowMs() - ctx.started_at_ms : payload.pipeline_elapsed_ms ?? null,
      ...payload,
    })
  );
}

export type RenewalPipelineContextInput = Omit<RenewalPipelineContext, 'started_at_ms'> & {
  started_at_ms?: number;
};

/** Emite estágio com contexto explícito (worker/scheduler sem ALS). */
export function emitRenewalPipelineStage(
  ctx: RenewalPipelineContextInput,
  stage: RenewalPipelineStage,
  fields: Record<string, unknown> = {},
  ok = true
): number {
  const startedMs = ctx.started_at_ms ?? nowMs();
  emit(stage, {
    correlation_id: ctx.correlation_id,
    subscription_id: ctx.subscription_id,
    job_id: ctx.job_id,
    invoice_id: ctx.invoice_id,
    cycle_key: ctx.cycle_key,
    execution_mode: ctx.execution_mode,
    pipeline_elapsed_ms: nowMs() - startedMs,
    ok,
    duration_ms: fields.duration_ms ?? 0,
    ...fields,
  });
  return startedMs;
}

export function emitRenewalPipelineStageEnd(
  ctx: RenewalPipelineContextInput,
  stage: RenewalPipelineStage,
  stageStartedMs: number,
  fields: Record<string, unknown> = {},
  ok = true
): void {
  emitRenewalPipelineStage(ctx, stage, { ...fields, duration_ms: nowMs() - stageStartedMs, phase: 'end' }, ok);
}

export function emitRenewalPipelineError(
  ctx: RenewalPipelineContextInput,
  stage: RenewalPipelineStage,
  err: unknown,
  fields: Record<string, unknown> = {}
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  emitRenewalPipelineStage(
    ctx,
    'ERROR',
    {
      failed_stage: stage,
      error: message.slice(0, 2000),
      stack: stack?.slice(0, 3000),
      ...fields,
    },
    false
  );
}

export function traceRenewalPipelineStage(
  stage: RenewalPipelineStage,
  fields: Record<string, unknown> = {},
  ok = true
): void {
  const started = nowMs();
  const list = stagesStorage.getStore();
  if (list) {
    list.push({ stage, started_at_ms: started, ok, fields });
  }
  emit(stage, { ok, duration_ms: 0, ...fields });
}

export function traceRenewalPipelineStageEnd(
  stage: RenewalPipelineStage,
  startedMs: number,
  fields: Record<string, unknown> = {},
  ok = true
): void {
  const duration_ms = nowMs() - startedMs;
  const list = stagesStorage.getStore();
  const last = list?.filter((s) => s.stage === stage).pop();
  if (last) {
    last.duration_ms = duration_ms;
    last.ok = ok;
    last.fields = { ...last.fields, ...fields };
  }
  emit(stage, { ok, duration_ms, phase: 'end', ...fields });
}

export function traceRenewalPipelineError(
  stage: RenewalPipelineStage,
  err: unknown,
  fields: Record<string, unknown> = {}
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  traceRenewalPipelineStage('ERROR', {
    failed_stage: stage,
    error: message.slice(0, 2000),
    stack: stack?.slice(0, 3000),
    ...fields,
  }, false);
}

export function getRenewalPipelineStageSummary(): StageRecord[] {
  return stagesStorage.getStore() ?? [];
}

/** SQL fragment: statuses reset on manual immediate prepare. */
export const MANUAL_JOB_PREPARE_STATUSES_SQL = "('pending', 'failed', 'processing')";
