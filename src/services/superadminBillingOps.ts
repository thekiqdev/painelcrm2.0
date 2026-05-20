import { apiClient } from '@/integrations/api/client';

export type BillingHealthScore = 'healthy' | 'warning' | 'critical';

export interface BillingHealthSnapshot {
  score: BillingHealthScore;
  score_reasons: string[];
  generated_at: string;
  dry_run_default: boolean;
  counts: {
    pending_jobs: number;
    failed_jobs: number;
    stuck_processing_jobs: number;
    orphan_cycles: number;
    orphan_invoices: number;
    failed_notifications: number;
    stuck_notification_queue: number;
    notification_excessive_retries: number;
    gateway_failures: number;
    retry_queue_due: number;
  };
  heartbeats: {
    table_present: boolean;
    heartbeats: Array<{
      process_key: string;
      last_run_at: string;
      age_minutes: number;
      stale: boolean;
    }>;
  };
  jobs_summary: {
    pending: number;
    processing: number;
    failed: number;
    window_days: number;
  };
  samples: {
    orphan_cycles: Array<{ kind: string; entity_id: string; detail: string; tenant_id: string | null }>;
    orphan_invoices: Array<{ kind: string; entity_id: string; detail: string; tenant_id: string | null }>;
    failed_notifications: Array<{ kind: string; entity_id: string; detail: string }>;
    stuck_processing_jobs: Array<{ kind: string; entity_id: string; detail: string }>;
    gateway_failures: Array<{ kind: string; entity_id: string; detail: string }>;
    recent_recovery_audit: Array<{
      id: string;
      action_type: string;
      entity_id: string | null;
      dry_run: boolean;
      created_at: string;
      detail: Record<string, unknown> | null;
    }>;
  };
}

export interface BillingRecoveryRunReport {
  run_id: string;
  dry_run: boolean;
  health_before: BillingHealthScore;
  health_after: BillingHealthScore;
  repairs: Array<{ action: string; count: number; applied: boolean; dry_run: boolean }>;
}

export const superadminBillingOpsService = {
  async getHealth(): Promise<BillingHealthSnapshot> {
    const res = await apiClient.get<BillingHealthSnapshot>('/api/superadmin/billing/health');
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Resposta vazia');
    return res.data;
  },

  async runRecovery(dryRun: boolean): Promise<BillingRecoveryRunReport> {
    const res = await apiClient.post<BillingRecoveryRunReport>('/api/superadmin/billing/recovery/run', {
      dry_run: dryRun,
    });
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Resposta vazia');
    return res.data;
  },
};
