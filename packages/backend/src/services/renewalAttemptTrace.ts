/**
 * Rastreio estruturado por tentativa de renovação (auditoria P0).
 * Agregar em produção via `[RENEWAL_TRACE]`.
 */
import { billingLog } from './billingLogger.js';

export type RenewalAttemptPhase =
  | 'scheduler_enqueue'
  | 'worker_pickup'
  | 'worker_window_requeue'
  | 'worker_process'
  | 'worker_complete'
  | 'worker_error'
  | 'worker_cancel';

export type RenewalAttemptTraceFields = {
  phase: RenewalAttemptPhase;
  subscription_id: string;
  tenant_id?: string;
  job_id?: string;
  worker_id?: string;
  contract_interval?: string;
  cycle_key?: string;
  period_start?: string;
  period_end?: string;
  due_date?: string;
  invoice_creation_date?: string;
  generation_date_ymd?: string;
  generate_days_before_due_tenant?: number;
  generate_days_before_due_effective?: number;
  generate_days_capped?: boolean;
  invoice_id?: string | null;
  attempt?: number;
  max_attempts?: number;
  retry_at?: string | null;
  duration_ms?: number;
  result?: string;
  exception?: string;
  gateway?: string | null;
  gateway_status?: string | null;
  final_status?: string;
  prev_invoice_resolution?: string;
  lookup_period_start?: string;
};

export function logRenewalAttemptTrace(fields: RenewalAttemptTraceFields): void {
  const payload = {
    ...fields,
    ts: new Date().toISOString(),
  };
  console.log('[RENEWAL_TRACE]', JSON.stringify(payload));
  billingLog('job', `renewal_trace_${fields.phase}`, {
    subscriptionId: fields.subscription_id,
    jobId: fields.job_id,
    tenantId: fields.tenant_id,
    phase: fields.phase,
    result: fields.result,
    ...(fields.exception ? { error: fields.exception.slice(0, 500) } : {}),
  });
}
