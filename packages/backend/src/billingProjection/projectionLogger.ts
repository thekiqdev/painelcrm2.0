/**
 * Billing Engine V2 — Sprint 2.3D: [PROJECTION_*] structured logs.
 */
import { billingLog } from '../services/billingLogger.js';
import type { ProjectionStage } from './types.js';

export type ProjectionLogPayload = {
  correlation_id?: string;
  subscription_id: string;
  cycle_key?: string;
  duration_ms?: number;
  stage?: ProjectionStage | string;
  error?: string;
  hash?: string;
  cache_hit?: boolean;
};

export function logProjectionEngine(
  message: string,
  payload: ProjectionLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[PROJECTION_ENGINE] ${message}`, {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    duration_ms: payload.duration_ms,
    cache_hit: payload.cache_hit,
    error: payload.error,
    ...extra,
  });
}

export function logProjectionStage(
  stage: ProjectionStage,
  payload: ProjectionLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[PROJECTION_STAGE] ${stage}`, {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    stage,
    duration_ms: payload.duration_ms,
    ...extra,
  });
}

export function logProjectionCompare(
  message: string,
  payload: ProjectionLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[PROJECTION_COMPARE] ${message}`, {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    duration_ms: payload.duration_ms,
    ...extra,
  });
}

export function logProjectionHash(
  payload: ProjectionLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', '[PROJECTION_HASH]', {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    hash: payload.hash,
    ...extra,
  });
}

export function logProjectionError(
  payload: ProjectionLogPayload,
  error: unknown,
  code: string
): void {
  const msg = error instanceof Error ? error.message : String(error);
  billingLog('job', '[PROJECTION_ERROR]', {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    error: msg,
    code,
  });
}
