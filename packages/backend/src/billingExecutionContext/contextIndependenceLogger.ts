/**
 * Billing Engine V2 — Sprint 3.0B: logs de independência do contexto.
 */
import { billingLog } from '../services/billingLogger.js';

type IndependenceLogPayload = {
  correlation_id?: string;
  subscription_id: string;
  code?: string;
  legacy_markers?: string[];
};

export function logContextIndependence(
  event: string,
  payload: IndependenceLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[CONTEXT_INDEPENDENCE] ${event}`, {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    code: payload.code,
    legacy_markers: payload.legacy_markers?.join(','),
    ...extra,
  });
}

export function logContextCertified(payload: IndependenceLogPayload): void {
  billingLog('job', '[CONTEXT_CERTIFIED]', {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
  });
}

export function logContextLegacyRejected(
  payload: IndependenceLogPayload,
  reason: string
): void {
  billingLog('job', '[CONTEXT_LEGACY_REJECTED]', {
    correlation_id: payload.correlation_id,
    subscription_id: payload.subscription_id,
    reason,
  });
}
