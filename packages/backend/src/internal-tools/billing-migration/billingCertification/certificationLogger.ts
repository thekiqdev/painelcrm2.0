/**
 * Billing Engine V2 — Sprint 2.4A: [CERTIFICATION_*] structured logs.
 */
import { billingLog } from '../../../services/billingLogger.js';

export type CertificationLogPayload = {
  tenant_id: string;
  subscription_id?: string;
  correlation_id?: string;
  stage?: string;
  score?: number;
  duration_ms?: number;
  certified?: boolean;
  recommendation?: string;
  code?: string;
};

export function logCertification(event: string, payload: CertificationLogPayload): void {
  billingLog('job', `[CERTIFICATION] ${event}`, {
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    correlation_id: payload.correlation_id,
    score: payload.score,
    duration_ms: payload.duration_ms,
    certified: payload.certified,
    recommendation: payload.recommendation,
  });
}

export function logCertificationStage(payload: CertificationLogPayload): void {
  billingLog('job', '[CERTIFICATION_STAGE]', {
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    correlation_id: payload.correlation_id,
    stage: payload.stage,
    score: payload.score,
    duration_ms: payload.duration_ms,
  });
}

export function logCertificationResult(payload: CertificationLogPayload): void {
  billingLog('job', '[CERTIFICATION_RESULT]', {
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    correlation_id: payload.correlation_id,
    score: payload.score,
    duration_ms: payload.duration_ms,
    certified: payload.certified,
    recommendation: payload.recommendation,
  });
}

export function logCertificationFailed(payload: CertificationLogPayload): void {
  billingLog('job', '[CERTIFICATION_FAILED]', {
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    correlation_id: payload.correlation_id,
    score: payload.score,
    duration_ms: payload.duration_ms,
    code: payload.code,
  });
}
