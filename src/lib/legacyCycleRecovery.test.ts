import { describe, it, expect } from 'vitest';
import {
  isLegacyFalseCancelledTimelineRow,
  normalizeDetailForLegacyCycleRecovery,
} from './legacyCycleRecovery';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

function timelineRow(
  partial: Partial<CrmSubscriptionTimelineRow>
): CrmSubscriptionTimelineRow {
  return {
    month_ref: 'Jul/2026',
    cycle_label: 'Ciclo',
    cycle_subtitle: 'Jul/2026',
    cycle_date: '2026-07-01',
    period_label: '—',
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    due_date: '2026-07-15',
    status_pt: 'Cancelado',
    operational_state: 'cancelled',
    operational_state_pt: 'Cancelado',
    amount_cents: 10000,
    invoice_id: null,
    cycle_status: 'cancelled',
    cycle_id: 'c1',
    job_id: null,
    merge_source: 'cycle',
    ...partial,
  };
}

function minimalDetail(
  timeline: CrmSubscriptionTimelineRow[],
  status = 'active'
): CrmSubscriptionDetailPayload {
  return {
    subscription: {
      id: 'sub-1',
      tenant_id: 't1',
      customer_id: 'client-1',
      type: 'customer',
      status,
      amount_cents: 10000,
      billing_interval: 'monthly',
      next_billing_date: '2026-07-15',
      gateway: null,
      cancel_at_period_end: false,
      cycles_unlimited: true,
      max_cycles: null,
      current_period_start: null,
      current_period_end: null,
      created_at: '',
      updated_at: '',
    },
    client_name: 'Cliente',
    plan_label: 'Plano',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: {
      total_invoiced_cents: 0,
      total_paid_cents: 0,
      total_pending_cents: 0,
      charge_count: 0,
    },
    timeline,
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: null,
      next_charge_ymd: '2026-07-15',
      worker_status_pt: '—',
      last_worker_check_at: null,
    },
    cycles_raw: [],
    cycles_read_enabled: true,
    tenant_billing: {
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: null,
      invoice_notify_same_as_generation: null,
      invoice_notify_time_local: null,
    },
    recent_jobs: [],
    pending_contract: null,
    meta: { periodicity_label_pt: 'Mensal' },
  };
}

describe('legacyCycleRecovery', () => {
  it('ciclo cancelled sem invoice vira Prevista na normalização', () => {
    const detail = minimalDetail([timelineRow({})]);
    const normalized = normalizeDetailForLegacyCycleRecovery(detail);
    expect(normalized.timeline[0]?.operational_state).toBe('awaiting_generation');
    expect(normalized.timeline[0]?.status_pt).toBe('Prevista');
  });

  it('assinatura cancelada oficialmente mantém ciclo cancelled', () => {
    const row = timelineRow({});
    expect(isLegacyFalseCancelledTimelineRow(row, 'cancelled')).toBe(false);
  });

  it('ciclo com manual_cancel não é recuperado', () => {
    const row = timelineRow({ cycle_skipped_reason: 'manual_cancel' });
    expect(isLegacyFalseCancelledTimelineRow(row, 'active')).toBe(false);
  });
});
