import { apiClient } from '@/integrations/api/client';

export interface CrmSubscriptionListItem {
  id: string;
  client_id: string | null;
  client_name: string | null;
  /** Assinatura sem customer_id no motor (ex.: por link). */
  link_checkout?: boolean;
  plan_label: string | null;
  amount_cents: number;
  billing_interval: string;
  next_billing_date: string;
  status: string;
  cancel_at_period_end: boolean;
  cycles_unlimited?: boolean;
  max_cycles?: number | null;
}

export interface CrmSubscriptionTimelineRow {
  month_ref: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status_pt: string;
  amount_cents: number | null;
  invoice_id: string | null;
  cycle_status: string | null;
  cycle_id: string | null;
  job_id: string | null;
}

export interface CrmSubscriptionStats {
  total_invoiced_cents: number;
  total_paid_cents: number;
  total_pending_cents: number;
  charge_count: number;
}

export interface CrmSubscriptionJobRow {
  id: string;
  cycle_key: string;
  status: string;
  scheduled_at: string;
  retry_at: string | null;
  attempts: number;
  max_attempts: number;
  result_invoice_id: string | null;
  error_message: string | null;
  completion_outcome: string | null;
  completion_detail: string | null;
  updated_at: string;
}

export interface CrmSubscriptionTenantBillingPrefs {
  timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  recurring_invoice_generate_days_before_due?: number | null;
}

export interface CrmSubscriptionDetailPayload {
  subscription: {
    id: string;
    type: string;
    tenant_id: string;
    customer_id: string | null;
    plan_id: string | null;
    amount_cents: number;
    currency: string;
    billing_anchor_day: number | null;
    billing_cycle_count: number;
    billing_interval: string;
    status: string;
    next_billing_date: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grace_period_days: number;
    default_payment_method: string | null;
    users_count: number | null;
    gateway: string | null;
    last_job_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    cycles_unlimited?: boolean;
    max_cycles?: number | null;
  };
  client_name: string | null;
  plan_label: string | null;
  latest_invoice_id: string | null;
  latest_invoice_status: string | null;
  latest_paid_invoice_id: string | null;
  stats: CrmSubscriptionStats;
  timeline: CrmSubscriptionTimelineRow[];
  cycles_raw: Array<{
    id: string;
    cycle_date: string;
    period_start: string;
    period_end: string;
    status: string;
    invoice_id: string | null;
    job_id: string | null;
    processed_at: string | null;
    skipped_reason: string | null;
    error_message: string | null;
  }>;
  cycles_read_enabled: boolean;
  tenant_billing: CrmSubscriptionTenantBillingPrefs;
  recent_jobs: CrmSubscriptionJobRow[];
  meta: { periodicity_label_pt: string };
}

export const crmSubscriptionsService = {
  async list(): Promise<CrmSubscriptionListItem[]> {
    const res = await apiClient.get<{ subscriptions: CrmSubscriptionListItem[] }>('/api/crm-subscriptions');
    if (res.error) throw new Error(res.error);
    return res.data?.subscriptions ?? [];
  },

  async getById(id: string): Promise<CrmSubscriptionDetailPayload> {
    const res = await apiClient.get<CrmSubscriptionDetailPayload>(`/api/crm-subscriptions/${id}`);
    if (res.error) throw new Error(res.error);
    if (!res.data || typeof res.data !== 'object') throw new Error('Resposta inválida');
    return res.data;
  },

  async patchNextBilling(id: string, next_billing_date: string): Promise<unknown> {
    const res = await apiClient.patch<unknown>(`/api/crm-subscriptions/${id}/next-billing`, { next_billing_date });
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  async cancel(id: string, mode: 'immediate' | 'end_of_period'): Promise<void> {
    const res = await apiClient.post<unknown>(`/api/crm-subscriptions/${id}/cancel`, { mode });
    if (res.error) throw new Error(res.error);
  },

  async patchCyclesConfig(
    id: string,
    body: { cycles_unlimited: boolean; max_cycles: number | null }
  ): Promise<CrmSubscriptionDetailPayload['subscription']> {
    const res = await apiClient.patch<{ subscription: CrmSubscriptionDetailPayload['subscription'] }>(
      `/api/crm-subscriptions/${encodeURIComponent(id)}/cycles-config`,
      body
    );
    if (res.error) throw new Error(res.error);
    if (!res.data?.subscription) throw new Error('Resposta inválida');
    return res.data.subscription;
  },
};
