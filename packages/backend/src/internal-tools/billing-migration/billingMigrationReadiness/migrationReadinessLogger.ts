/**
 * Billing Engine V2 — Sprint 2.3E: [MIGRATION_*] structured logs.
 */
import { billingLog } from '../../../services/billingLogger.js';
import type { MigrationApprovalLevel, MigrationRecommendation } from './types.js';

export type MigrationLogPayload = {
  tenant_id: string;
  overall_score?: number;
  approval?: MigrationApprovalLevel;
  recommendation?: MigrationRecommendation;
  critical_count?: number;
  duration_ms?: number;
  code?: string;
};

export function logMigrationReadiness(
  event: string,
  payload: MigrationLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[MIGRATION_READINESS] ${event}`, {
    tenant_id: payload.tenant_id,
    overall_score: payload.overall_score,
    approval: payload.approval,
    recommendation: payload.recommendation,
    critical_count: payload.critical_count,
    duration_ms: payload.duration_ms,
    ...extra,
  });
}

export function logMigrationScore(payload: MigrationLogPayload): void {
  billingLog('job', '[MIGRATION_SCORE]', {
    tenant_id: payload.tenant_id,
    overall_score: payload.overall_score,
    duration_ms: payload.duration_ms,
  });
}

export function logMigrationApproval(payload: MigrationLogPayload): void {
  billingLog('job', '[MIGRATION_APPROVAL]', {
    tenant_id: payload.tenant_id,
    approval: payload.approval,
    recommendation: payload.recommendation,
    overall_score: payload.overall_score,
  });
}

export function logMigrationBlocker(payload: MigrationLogPayload): void {
  billingLog('job', '[MIGRATION_BLOCKER]', {
    tenant_id: payload.tenant_id,
    code: payload.code,
    critical_count: payload.critical_count,
  });
}
