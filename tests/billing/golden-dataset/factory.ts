import type {
  CrmSubscriptionDetailPayload,
  CrmSubscriptionJobRow,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';
import { cyclesRawFromTimeline } from '@/lib/testHelpers/subscriptionCyclesFixture';

export function timelineRow(
  overrides: Partial<CrmSubscriptionTimelineRow> = {}
): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: 'Jul/26',
    cycle_date: '2026-07-14',
    period_label: 'Jul/26',
    period_start: '2026-07-07',
    period_end: '2026-08-07',
    due_date: '2026-07-14',
    status_pt: 'Prevista',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Prevista',
    amount_cents: 11_000,
    invoice_id: null,
    invoice_status: null,
    gateway_status: null,
    gateway_reference_id: null,
    cycle_status: 'pending',
    cycle_id: 'cycle-default',
    job_id: null,
    merge_source: 'cycle',
    ...overrides,
  };
}

export function invoiceOnlyRow(
  overrides: Partial<CrmSubscriptionTimelineRow> = {}
): CrmSubscriptionTimelineRow {
  return timelineRow({
    cycle_id: null,
    merge_source: 'invoice_only',
    operational_state: 'generated',
    status_pt: 'Pendente',
    invoice_id: 'inv-orphan',
    invoice_status: 'pending',
    invoice_created_at: '2026-06-15T10:00:00Z',
    ...overrides,
  });
}

export function lifecycleRow(
  event: 'pause' | 'resume' | 'reactivate',
  overrides: Partial<CrmSubscriptionTimelineRow> = {}
): CrmSubscriptionTimelineRow {
  return timelineRow({
    cycle_id: null,
    merge_source: 'lifecycle',
    operational_state: 'lifecycle_event',
    lifecycle_event: event,
    due_date: '2026-06-01',
    cycle_date: '2026-06-01',
    ...overrides,
  });
}

export function jobRow(
  overrides: Partial<CrmSubscriptionJobRow> = {}
): CrmSubscriptionJobRow {
  return {
    id: 'job-1',
    cycle_key: '2026-07-14',
    status: 'pending',
    scheduled_at: '2026-07-14T08:00:00Z',
    retry_at: null,
    attempts: 0,
    max_attempts: 3,
    result_invoice_id: null,
    error_message: null,
    completion_outcome: null,
    completion_detail: null,
    updated_at: '2026-07-14T08:00:00Z',
    ...overrides,
  };
}

const defaultSubscription: CrmSubscriptionDetailPayload['subscription'] = {
  id: 'sub-golden',
  type: 'customer',
  tenant_id: 'tenant-1',
  customer_id: 'client-1',
  plan_id: 'plan-1',
  amount_cents: 11_000,
  currency: 'BRL',
  billing_anchor_day: 14,
  billing_cycle_count: 1,
  billing_interval: 'monthly',
  status: 'active',
  next_billing_date: '2026-08-14',
  current_period_start: '2026-07-14',
  current_period_end: '2026-08-14',
  cancel_at_period_end: false,
  grace_period_days: 0,
  default_payment_method: null,
  users_count: 1,
  gateway: 'mercadopago',
  last_job_at: null,
  created_by: null,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-06-30T10:00:00Z',
  cycles_unlimited: true,
  max_cycles: null,
};

export function buildGoldenDetail(
  overrides: Partial<CrmSubscriptionDetailPayload> & {
    timeline?: CrmSubscriptionTimelineRow[];
  } = {}
): CrmSubscriptionDetailPayload {
  const {
    timeline: timelineOverride,
    subscription: subscriptionOverride,
    cycles_raw: cyclesRawOverride,
    ...rest
  } = overrides;
  const timeline = timelineOverride ?? [timelineRow()];
  const cycles_raw =
    cyclesRawOverride !== undefined ? cyclesRawOverride : cyclesRawFromTimeline(timeline);

  return {
    client_name: 'Cliente Golden',
    plan_label: 'Plano Mensal',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: {
      total_invoiced_cents: 0,
      total_paid_cents: 0,
      total_pending_cents: 0,
      charge_count: 0,
    },
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-08-14',
      next_charge_ymd: '2026-08-14',
      worker_status_pt: 'Ocioso',
      last_worker_check_at: null,
    },
    tenant_billing: {
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '08:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: '08:00',
      recurring_invoice_generate_days_before_due: 0,
    },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Mensal' },
    ...rest,
    subscription: { ...defaultSubscription, ...subscriptionOverride },
    timeline,
    cycles_raw,
    cycles_read_enabled: overrides.cycles_read_enabled ?? cycles_raw.length > 0,
  };
}
