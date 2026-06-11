import { apiClient } from '@/integrations/api/client';

export const LIFECYCLE_EVENT_FILTER_OPTIONS = [
  'onboarding.started',
  'onboarding.completed',
  'trial.started',
  'trial.expired',
  'trial.recovery.day1',
  'trial.recovery.day3',
  'trial.recovery.day7',
  'trial.recovery.last_attempt',
  'trial.engagement.started',
  'trial.engagement.day2',
  'trial.engagement.day4',
  'trial.engagement.day6',
  'trial.engagement.finalizing',
  'subscription.activated',
  'subscription.cancelled',
] as const;

export const LIFECYCLE_RESULT_FILTER_OPTIONS = [
  'moved',
  'already_at_destination',
  'promotion_disabled',
  'card_not_found',
  'board_not_found',
  'column_not_found',
  'error',
] as const;

export type LifecycleTransitionRow = {
  id: string;
  created_at: string;
  event_type: string;
  result: string;
  correlation_id: string | null;
  acquisition_lead_id: string | null;
  tenant_id: string | null;
  card_id: string | null;
  lead_label: string | null;
  tenant_label: string | null;
  source_board_name: string | null;
  source_column_name: string | null;
  destination_board_name: string | null;
  destination_column_name: string | null;
  metadata_json: Record<string, unknown>;
};

export type LifecycleDashboardMetrics = {
  today: {
    events_observed: number;
    promotions_moved: number;
    failures: number;
  };
  last_30_days: {
    onboarding_completed: number;
    subscription_activated: number;
    trial_expired: number;
    subscription_cancelled: number;
  };
};

export type LifecycleTransitionsResponse = {
  items: LifecycleTransitionRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  metrics: LifecycleDashboardMetrics;
};

export type LifecycleTransitionsQuery = {
  page?: number;
  limit?: number;
  event_type?: string;
  result?: string;
  tenant?: string;
  lead?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
};

function buildQueryString(q: LifecycleTransitionsQuery): string {
  const params = new URLSearchParams();
  if (q.page) params.set('page', String(q.page));
  if (q.limit) params.set('limit', String(q.limit));
  if (q.event_type) params.set('event_type', q.event_type);
  if (q.result) params.set('result', q.result);
  if (q.tenant) params.set('tenant', q.tenant);
  if (q.lead) params.set('lead', q.lead);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.order) params.set('order', q.order);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function fetchLifecycleTransitions(
  query: LifecycleTransitionsQuery,
): Promise<LifecycleTransitionsResponse> {
  const res = await apiClient.get<LifecycleTransitionsResponse>(
    `/api/superadmin/lifecycle/transitions${buildQueryString(query)}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error || 'Falha ao carregar transições do lifecycle');
  }
  return res.data;
}
