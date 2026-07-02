/**
 * Billing Engine V2 — Shadow Mode structured logs.
 */
import { billingLog } from '../../../services/billingLogger.js';

export type ShadowLogContext = {
  correlation_id: string;
  subscription_id: string;
  cycle_key: string;
  engine_version?: string;
  duration_ms?: number;
  score?: number;
  approved?: boolean;
  error?: string;
};

function basePayload(ctx: ShadowLogContext): Record<string, string | number | boolean | undefined> {
  return {
    correlation_id: ctx.correlation_id,
    subscription_id: ctx.subscription_id,
    cycle_key: ctx.cycle_key,
    engine_version: ctx.engine_version ?? 'v2_shadow',
    duration_ms: ctx.duration_ms,
    score: ctx.score,
    approved: ctx.approved,
    error: ctx.error,
  };
}

export function logShadowEngine(stage: string, ctx: ShadowLogContext, extra?: Record<string, string | number | boolean | undefined>): void {
  billingLog('job', `[SHADOW_ENGINE] ${stage}`, { ...basePayload(ctx), ...extra });
}

export function logShadowCompare(stage: string, ctx: ShadowLogContext, extra?: Record<string, string | number | boolean | undefined>): void {
  billingLog('job', `[SHADOW_COMPARE] ${stage}`, { ...basePayload(ctx), ...extra });
}

export function logShadowReport(stage: string, ctx: ShadowLogContext, extra?: Record<string, string | number | boolean | undefined>): void {
  billingLog('job', `[SHADOW_REPORT] ${stage}`, { ...basePayload(ctx), ...extra });
}

export function logShadowError(ctx: ShadowLogContext, error: unknown, code = 'SHADOW_EXECUTION_FAILED'): void {
  const message = error instanceof Error ? error.message : String(error);
  billingLog('job', `[SHADOW_ERROR] ${code}`, {
    ...basePayload({ ...ctx, error: message }),
    error_code: code,
  });
}
