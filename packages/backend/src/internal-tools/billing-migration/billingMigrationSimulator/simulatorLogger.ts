/**
 * Billing Engine V2 — Sprint 2.3F: [MIGRATION_*] simulator logs.
 */
import { billingLog } from '../../../services/billingLogger.js';
import type { MigrationSimulationRecommendation } from './types.js';

export type SimulatorLogPayload = {
  correlation_id?: string;
  tenant_id: string;
  subscription_id?: string;
  cycle_key?: string;
  duration_ms?: number;
  score?: number;
  recommendation?: MigrationSimulationRecommendation | string;
  risk?: string;
};

export function logMigrationSimulator(
  event: string,
  payload: SimulatorLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[MIGRATION_SIMULATOR] ${event}`, {
    correlation_id: payload.correlation_id,
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    duration_ms: payload.duration_ms,
    score: payload.score,
    recommendation: payload.recommendation,
    ...extra,
  });
}

export function logMigrationImpact(payload: SimulatorLogPayload): void {
  billingLog('job', '[MIGRATION_IMPACT]', {
    correlation_id: payload.correlation_id,
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    cycle_key: payload.cycle_key,
    score: payload.score,
    risk: payload.risk,
  });
}

export function logMigrationAnalyzer(
  event: string,
  payload: SimulatorLogPayload,
  extra?: Record<string, string | number | boolean | undefined>
): void {
  billingLog('job', `[MIGRATION_ANALYZER] ${event}`, {
    correlation_id: payload.correlation_id,
    tenant_id: payload.tenant_id,
    subscription_id: payload.subscription_id,
    duration_ms: payload.duration_ms,
    ...extra,
  });
}

export function logMigrationReport(payload: SimulatorLogPayload): void {
  billingLog('job', '[MIGRATION_REPORT]', {
    correlation_id: payload.correlation_id,
    tenant_id: payload.tenant_id,
    duration_ms: payload.duration_ms,
    score: payload.score,
    recommendation: payload.recommendation,
  });
}
