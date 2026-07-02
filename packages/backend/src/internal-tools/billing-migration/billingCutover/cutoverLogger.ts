/**
 * Billing Engine V2 — Sprint 2.3G: [CUTOVER_*] structured logs.
 */
import { billingLog } from '../../../services/billingLogger.js';
import type { CutoverApprovalLevel, FeatureFlagRecommendation } from './types.js';

export type CutoverLogPayload = {
  tenant_id: string;
  correlation_id?: string;
  approval_level?: CutoverApprovalLevel | string;
  recommendation?: FeatureFlagRecommendation | string;
  duration_ms?: number;
  code?: string;
  approved?: boolean;
};

export function logCutover(event: string, payload: CutoverLogPayload, extra?: Record<string, string | number | boolean | undefined>): void {
  billingLog('job', `[CUTOVER] ${event}`, {
    tenant_id: payload.tenant_id,
    correlation_id: payload.correlation_id,
    approval_level: payload.approval_level,
    recommendation: payload.recommendation,
    duration_ms: payload.duration_ms,
    approved: payload.approved,
    ...extra,
  });
}

export function logCutoverPolicy(payload: CutoverLogPayload, extra?: Record<string, string | number | boolean | undefined>): void {
  billingLog('job', '[CUTOVER_POLICY]', {
    tenant_id: payload.tenant_id,
    correlation_id: payload.correlation_id,
    approved: payload.approved,
    ...extra,
  });
}

export function logCutoverDecision(payload: CutoverLogPayload): void {
  billingLog('job', '[CUTOVER_DECISION]', {
    tenant_id: payload.tenant_id,
    correlation_id: payload.correlation_id,
    approval_level: payload.approval_level,
    recommendation: payload.recommendation,
    duration_ms: payload.duration_ms,
    approved: payload.approved,
  });
}

export function logCutoverBlocker(payload: CutoverLogPayload): void {
  billingLog('job', '[CUTOVER_BLOCKER]', {
    tenant_id: payload.tenant_id,
    correlation_id: payload.correlation_id,
    code: payload.code,
  });
}

export function logCutoverRecommendation(payload: CutoverLogPayload): void {
  billingLog('job', '[CUTOVER_RECOMMENDATION]', {
    tenant_id: payload.tenant_id,
    correlation_id: payload.correlation_id,
    recommendation: payload.recommendation,
    approval_level: payload.approval_level,
  });
}
