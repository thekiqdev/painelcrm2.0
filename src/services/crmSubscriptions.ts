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

export type SubscriptionTimelineOperationalState =
  | 'scheduled'
  | 'awaiting_generation'
  | 'in_queue'
  | 'processing'
  | 'generated'
  | 'paid'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'gateway_failed'
  | 'manual_invoice'
  | 'lifecycle_event';

export interface CrmSubscriptionTimelineRow {
  month_ref: string;
  cycle_label: string;
  cycle_subtitle: string;
  cycle_date: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status_pt: string;
  operational_state: SubscriptionTimelineOperationalState;
  operational_state_pt: string;
  amount_cents: number | null;
  invoice_id: string | null;
  invoice_created_at?: string | null;
  generation_note?: string | null;
  cycle_status: string | null;
  cycle_id: string | null;
  job_id: string | null;
  job_status?: string | null;
  job_attempts?: number | null;
  job_max_attempts?: number | null;
  job_retry_at?: string | null;
  job_error_snippet?: string | null;
  has_auto_retry?: boolean;
  processed_at?: string | null;
  invoice_status?: string | null;
  gateway_status?: string | null;
  gateway_reference_id?: string | null;
  merge_source?: 'cycle' | 'invoice_only' | 'lifecycle';
  lifecycle_event?: 'pause' | 'resume' | 'reactivate' | null;
  lifecycle_reason?: string | null;
  lifecycle_actor_name?: string | null;
  lifecycle_next_billing_date?: string | null;
}

export interface CrmSubscriptionAutomationSummary {
  last_generation_at: string | null;
  last_generation_label: string | null;
  next_generation_ymd: string | null;
  next_charge_ymd: string | null;
  worker_status_pt: string;
  last_worker_check_at: string | null;
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
  automation_summary: CrmSubscriptionAutomationSummary;
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
  pending_contract?: {
    amount_cents: number;
    billing_interval: string;
    description: string;
    effective_at: 'next_cycle';
    reason?: string | null;
    requested_at: string;
  } | null;
}

export type CrmSubscriptionBillingInterval =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'yearly';

export type PatchCrmSubscriptionContractBody = {
  amount_cents: number;
  billing_interval: CrmSubscriptionBillingInterval;
  description: string;
  effective_at: 'immediate' | 'next_cycle';
  reason?: string;
};

export type CrmSubscriptionHistoryChangeType =
  | 'upgrade'
  | 'downgrade'
  | 'interval_change'
  | 'description_change'
  | 'contract_update'
  | 'pause'
  | 'resume'
  | 'reactivate';

export type CrmSubscriptionContractHistoryRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  change_type: CrmSubscriptionHistoryChangeType;
  effective_at: 'immediate' | 'next_cycle' | null;
  reason: string | null;
  status: 'pending' | 'applied' | 'cancelled';
  previous_payload: {
    amount_cents: number;
    billing_interval: string;
    description: string;
  } | null;
  new_payload: {
    amount_cents: number;
    billing_interval: string;
    description: string;
  } | null;
  next_billing_date?: string | null;
};

export type CrmSubscriptionsAnalyticsPayload = {
  period: { from: string; to: string; preset?: string };
  mrr_cents: number;
  mrr_after_pending_cents: number;
  mrr_pending_delta_cents: number;
  arr_cents: number;
  active_count: number;
  paused_count: number;
  paused_mrr_cents: number;
  paused_arr_cents: number;
  new_count: number;
  cancelled_count: number;
  net_growth: number;
  average_ticket_cents: number;
  upcoming_7d_cents: number;
  last_payment: {
    client_id: string | null;
    client_name: string;
    amount_cents: number;
    paid_at: string;
  } | null;
  annual_projection_cents: number;
  by_interval: Array<{
    billing_interval: string;
    label_pt: string;
    count: number;
    mrr_cents: number;
  }>;
  top_clients: Array<{
    client_id: string | null;
    client_name: string;
    mrr_cents: number;
  }>;
  growth_by_month: Array<{
    month: string;
    new_count: number;
    cancelled_count: number;
  }>;
  projection_12m: {
    by_month: Array<{
      month: string;
      subscription_revenue_realized: number;
      subscription_revenue_pending: number;
      subscription_revenue_projected: number;
    }>;
  };
};

export const crmSubscriptionsService = {
  async list(): Promise<CrmSubscriptionListItem[]> {
    const res = await apiClient.get<{ subscriptions: CrmSubscriptionListItem[] }>('/api/crm-subscriptions');
    if (res.error) throw new Error(res.error);
    return res.data?.subscriptions ?? [];
  },

  async getAnalytics(params?: {
    preset?: string;
    from?: string;
    to?: string;
  }): Promise<CrmSubscriptionsAnalyticsPayload> {
    const q = new URLSearchParams();
    if (params?.preset) q.set('preset', params.preset);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await apiClient.get<CrmSubscriptionsAnalyticsPayload>(`/api/crm-subscriptions/analytics${qs}`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Analytics indisponível');
    return res.data;
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

  async patchContract(
    id: string,
    body: PatchCrmSubscriptionContractBody
  ): Promise<{ subscription: CrmSubscriptionDetailPayload['subscription']; pending: boolean }> {
    const res = await apiClient.patch<{
      subscription: CrmSubscriptionDetailPayload['subscription'];
      pending: boolean;
    }>(`/api/crm-subscriptions/${encodeURIComponent(id)}/contract`, body);
    if (res.error) throw new Error(res.error);
    if (!res.data?.subscription) throw new Error('Resposta inválida');
    return { subscription: res.data.subscription, pending: Boolean(res.data.pending) };
  },

  async getContractHistory(id: string): Promise<CrmSubscriptionContractHistoryRow[]> {
    const res = await apiClient.get<{ history: CrmSubscriptionContractHistoryRow[] }>(
      `/api/crm-subscriptions/${encodeURIComponent(id)}/contract-history`
    );
    if (res.error) throw new Error(res.error);
    return res.data?.history ?? [];
  },

  async pause(id: string, reason: string): Promise<CrmSubscriptionDetailPayload['subscription']> {
    const res = await apiClient.post<{ subscription: CrmSubscriptionDetailPayload['subscription'] }>(
      `/api/crm-subscriptions/${encodeURIComponent(id)}/pause`,
      { reason }
    );
    if (res.error) throw new Error(res.error);
    if (!res.data?.subscription) throw new Error('Resposta inválida');
    return res.data.subscription;
  },

  async resume(
    id: string,
    body: { next_billing_date: string; reason?: string }
  ): Promise<CrmSubscriptionDetailPayload['subscription']> {
    const res = await apiClient.post<{ subscription: CrmSubscriptionDetailPayload['subscription'] }>(
      `/api/crm-subscriptions/${encodeURIComponent(id)}/resume`,
      body
    );
    if (res.error) throw new Error(res.error);
    if (!res.data?.subscription) throw new Error('Resposta inválida');
    return res.data.subscription;
  },

  async reactivate(
    id: string,
    body: { next_billing_date: string; reason?: string }
  ): Promise<CrmSubscriptionDetailPayload['subscription']> {
    const res = await apiClient.post<{ subscription: CrmSubscriptionDetailPayload['subscription'] }>(
      `/api/crm-subscriptions/${encodeURIComponent(id)}/reactivate`,
      body
    );
    if (res.error) throw new Error(res.error);
    if (!res.data?.subscription) throw new Error('Resposta inválida');
    return res.data.subscription;
  },
};
