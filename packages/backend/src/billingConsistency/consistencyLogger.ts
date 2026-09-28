/**
 * Billing Engine V2 — Sprint 2.3B: structured consistency logs.
 */
import { billingLog } from '../services/billingLogger.js';

export type ConsistencyLogContext = {
  correlation_id?: string;
  subscription_id: string;
  plan_id?: string | null;
  confidence?: number;
  score?: number;
  severity?: string;
  duration_ms?: number;
};

function payload(ctx: ConsistencyLogContext): Record<string, string | number | boolean | undefined> {
  return {
    correlation_id: ctx.correlation_id,
    subscription_id: ctx.subscription_id,
    plan_id: ctx.plan_id ?? undefined,
    confidence: ctx.confidence,
    score: ctx.score,
    severity: ctx.severity,
    duration_ms: ctx.duration_ms,
  };
}

export function logBillingConsistency(
  stage: string,
  ctx: ConsistencyLogContext,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[BILLING_CONSISTENCY] ${stage}`, { ...payload(ctx), ...extra });
}

export function logBillingConfidence(
  stage: string,
  ctx: ConsistencyLogContext,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[BILLING_CONFIDENCE] ${stage}`, { ...payload(ctx), ...extra });
}

export function logBillingValidator(
  stage: string,
  ctx: ConsistencyLogContext,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[BILLING_VALIDATOR] ${stage}`, { ...payload(ctx), ...extra });
}

export function logBillingPlanCheck(
  stage: string,
  ctx: ConsistencyLogContext,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[BILLING_PLAN_CHECK] ${stage}`, { ...payload(ctx), ...extra });
}
