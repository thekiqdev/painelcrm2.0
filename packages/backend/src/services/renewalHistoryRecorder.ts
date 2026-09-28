/**
 * BILLING V2 Fase 1B — histórico padronizado de renovação.
 * Mesmo shape para manual | worker | scheduler | recovery | api.
 */
import { pool } from '../utils/db.js';
import { safeNowIso } from '../utils/billingSafeDate.js';
import type { BillingRenewalExecutionMode } from './billingRenewalEngine/types.js';

export type RenewalHistoryRecord = {
  execution_mode: BillingRenewalExecutionMode | string;
  initiated_by: 'manual' | 'worker' | 'scheduler' | 'recovery' | 'api' | 'automatic';
  subscription_id: string;
  tenant_id: string;
  job_id: string | null;
  invoice_id: string | null;
  cycle_key: string | null;
  correlation_id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  result: string;
  gateway_status: string | null;
  notification_status: string | null;
  error_code: string | null;
  stage: string | null;
};

function mapInitiatedBy(mode: string): RenewalHistoryRecord['initiated_by'] {
  switch (mode) {
    case 'manual':
      return 'manual';
    case 'scheduler':
      return 'scheduler';
    case 'recovery':
      return 'recovery';
    case 'api':
      return 'api';
    case 'automatic':
      return 'worker';
    default:
      return 'worker';
  }
}

export async function recordRenewalHistory(record: RenewalHistoryRecord): Promise<void> {
  console.log(
    '[RENEWAL_HISTORY]',
    JSON.stringify({
      ts: safeNowIso(),
      ...record,
    })
  );

  try {
    await pool.query(
      `INSERT INTO billing_recovery_audit (detail, created_at)
       VALUES ($1::jsonb, now())`,
      [
        JSON.stringify({
          kind: 'renewal_execution',
          execution_mode: record.execution_mode,
          initiated_by: record.initiated_by,
          subscription_id: record.subscription_id,
          tenant_id: record.tenant_id,
          job_id: record.job_id,
          invoice_id: record.invoice_id,
          cycle_key: record.cycle_key,
          correlation_id: record.correlation_id,
          started_at: record.started_at,
          finished_at: record.finished_at,
          duration_ms: record.duration_ms,
          success: record.success,
          result: record.result,
          gateway_status: record.gateway_status,
          notification_status: record.notification_status,
          error_code: record.error_code,
          stage: record.stage,
        }),
      ]
    );
  } catch {
    /* tabela opcional em alguns ambientes — log console é fonte primária */
  }
}

export function buildRenewalHistoryRecord(params: {
  execution_mode: string;
  subscription_id: string;
  tenant_id: string;
  job_id: string | null;
  invoice_id: string | null;
  cycle_key: string | null;
  correlation_id: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  result: string;
  gateway_status?: string | null;
  notification_status?: string | null;
  error_code?: string | null;
  stage?: string | null;
}): RenewalHistoryRecord {
  const startedMs = Date.parse(params.started_at);
  const finishedMs = Date.parse(params.finished_at);
  const duration_ms =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : 0;
  return {
    execution_mode: params.execution_mode,
    initiated_by: mapInitiatedBy(params.execution_mode),
    subscription_id: params.subscription_id,
    tenant_id: params.tenant_id,
    job_id: params.job_id,
    invoice_id: params.invoice_id,
    cycle_key: params.cycle_key,
    correlation_id: params.correlation_id,
    started_at: params.started_at,
    finished_at: params.finished_at,
    duration_ms,
    success: params.success,
    result: params.result,
    gateway_status: params.gateway_status ?? null,
    notification_status: params.notification_status ?? null,
    error_code: params.error_code ?? null,
    stage: params.stage ?? null,
  };
}
