/**
 * Billing Engine V2 — Sprint 2.3C: [BILLING_CONTEXT] structured logs.
 */
import { billingLog } from '../services/billingLogger.js';

export type ContextLogEvent =
  | 'BUILD_START'
  | 'SUBSCRIPTION'
  | 'PLAN'
  | 'ITEMS'
  | 'RESOLVED_ITEMS'
  | 'DATES'
  | 'GATEWAY'
  | 'NOTIFICATION'
  | 'COMPLETE'
  | 'ERROR';

export type ContextLogPayload = {
  correlation_id?: string;
  subscription_id: string;
  duration_ms?: number;
  cache_hit?: boolean;
  cache_miss?: boolean;
  error?: string;
};

export function logBillingContext(
  event: ContextLogEvent,
  payload: ContextLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[BILLING_CONTEXT] ${event}`, {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    duration_ms: payload.duration_ms,
    cache_hit: payload.cache_hit,
    cache_miss: payload.cache_miss,
    error: payload.error,
    ...extra,
  });
}
