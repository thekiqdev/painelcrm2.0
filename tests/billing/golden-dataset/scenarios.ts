import { expect } from 'vitest';
import type { GoldenScenario } from './types';
import { GOLDEN_TODAY_DEFAULT } from './types';
import {
  buildGoldenDetail,
  invoiceOnlyRow,
  jobRow,
  lifecycleRow,
  timelineRow,
} from './factory';

function scenario(
  id: string,
  title: string,
  auditRefs: string[],
  tags: GoldenScenario['tags'],
  build: GoldenScenario['build'],
  assert?: GoldenScenario['assert'],
  todayYmd = GOLDEN_TODAY_DEFAULT
): GoldenScenario {
  return { id, title, todayYmd, auditRefs, tags, build, assert };
}

/** Catálogo oficial — um fixture por cenário de negócio obrigatório da sprint 5.0-10A. */
export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  scenario(
    'first-charge-paid',
    'Primeira cobrança paga',
    ['4.2K', '4.2M'],
    ['subscription:active', 'invoice:paid', 'cycle:pending'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-first',
            due_date: '2026-06-14',
            invoice_id: 'inv-first',
            invoice_status: 'paid',
            operational_state: 'paid',
            status_pt: 'Pago',
            processed_at: '2026-06-14T12:00:00Z',
          }),
        ],
        stats: { total_invoiced_cents: 11_000, total_paid_cents: 11_000, total_pending_cents: 0, charge_count: 1 },
      })
  ),

  scenario(
    'subscription-newly-created',
    'Assinatura recém criada',
    ['4.2K'],
    ['subscription:active', 'cycle:pending'],
    () =>
      buildGoldenDetail({
        subscription: {
          created_at: '2026-06-28T10:00:00Z',
          next_billing_date: '2026-07-14',
        },
        timeline: [],
        cycles_raw: [],
        cycles_read_enabled: false,
      }),
    (ctx) => {
      expect(ctx.visual.calendar.projectedCount).toBeGreaterThan(0);
    }
  ),

  scenario(
    'subscription-paused',
    'Assinatura pausada',
    ['4.2K', '4.2N'],
    ['subscription:paused', 'lifecycle'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'paused' },
        timeline: [lifecycleRow('pause', { due_date: '2026-06-01' })],
        cycles_raw: [],
      })
  ),

  scenario(
    'subscription-resumed',
    'Assinatura retomada',
    ['4.2K', '4.2N'],
    ['subscription:active', 'lifecycle'],
    () =>
      buildGoldenDetail({
        timeline: [
          lifecycleRow('pause', { due_date: '2026-05-01' }),
          lifecycleRow('resume', { due_date: '2026-06-15' }),
          timelineRow({ cycle_id: 'c-after-resume', due_date: '2026-07-14' }),
        ],
      })
  ),

  scenario(
    'subscription-reactivated',
    'Assinatura reativada',
    ['4.2K'],
    ['subscription:active', 'lifecycle'],
    () =>
      buildGoldenDetail({
        timeline: [
          lifecycleRow('reactivate', { due_date: '2026-06-10' }),
          timelineRow({ cycle_id: 'c-reactivated', due_date: '2026-07-14' }),
        ],
      })
  ),

  scenario(
    'subscription-cancelled',
    'Assinatura cancelada',
    ['4.2K', '4.2N'],
    ['subscription:cancelled'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'cancelled', cancel_at_period_end: true },
        timeline: [
          timelineRow({
            cycle_id: 'c-last',
            operational_state: 'cancelled',
            status_pt: 'Cancelado',
            cycle_status: 'cancelled',
          }),
        ],
      })
  ),

  scenario(
    'charge-paid',
    'Cobrança paga',
    ['4.2M'],
    ['invoice:paid'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-paid',
            invoice_id: 'inv-paid',
            invoice_status: 'paid',
            operational_state: 'paid',
            status_pt: 'Pago',
            due_date: '2026-06-14',
          }),
        ],
      })
  ),

  scenario(
    'charge-overdue',
    'Cobrança vencida',
    ['4.2M', '4.2L'],
    ['invoice:due'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-overdue',
            invoice_id: 'inv-overdue',
            invoice_status: 'pending',
            operational_state: 'generated',
            status_pt: 'Atrasada',
            due_date: '2026-06-01',
          }),
        ],
      }),
    (ctx) => {
      expect(ctx.visual.sidebar.alertKinds).toContain('client_overdue');
    }
  ),

  scenario(
    'charge-future',
    'Cobrança futura',
    ['4.2H', '4.2M'],
    ['cycle:pending', 'generate'],
    () =>
      buildGoldenDetail({
        timeline: [timelineRow({ cycle_id: 'c-future', due_date: '2026-08-14' })],
      })
  ),

  scenario(
    'charge-manual',
    'Cobrança manual',
    ['4.2M'],
    ['invoice:due'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-manual',
            invoice_id: 'inv-manual',
            invoice_status: 'pending',
            operational_state: 'manual_invoice',
            status_pt: 'Manual',
            merge_source: 'cycle',
          }),
        ],
      })
  ),

  scenario(
    'charge-early-generated',
    'Cobrança gerada antecipadamente',
    ['4.2L', '4.2M'],
    ['generate', 'invoice:due'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-early',
            due_date: '2026-08-14',
            invoice_id: 'inv-early',
            invoice_status: 'pending',
            operational_state: 'generated',
            invoice_created_at: '2026-06-20T10:00:00Z',
          }),
        ],
      })
  ),

  scenario(
    'generate-jul-before-aug',
    'Gerar julho antes de agosto (gap setembro)',
    ['4.2L', '4.2J'],
    ['generate', 'gap'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-14', cycle_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c-oct', due_date: '2026-10-14', cycle_date: '2026-10-14' }),
        ],
      }),
    (ctx) => {
      expect(ctx.visual.history.generateCycleIds.sort()).toEqual(['c-jul', 'c-oct']);
    }
  ),

  scenario(
    'generate-oct-skip-sep',
    'Gerar outubro pulando setembro',
    ['4.2L'],
    ['generate', 'gap'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c-oct', due_date: '2026-10-01', cycle_date: '2026-10-01' }),
        ],
      })
  ),

  scenario(
    'generate-retroactive-months',
    'Gerar meses retroativos',
    ['4.2L', '4.2M'],
    ['generate'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-may', due_date: '2026-05-14', cycle_date: '2026-05-14' }),
          timelineRow({ cycle_id: 'c-jun', due_date: '2026-06-14', cycle_date: '2026-06-14' }),
        ],
      }),
    (ctx) => {
      expect(ctx.visual.history.generateCycleIds.length).toBeGreaterThanOrEqual(2);
    }
  ),

  scenario(
    'generate-multiple-future-months',
    'Gerar múltiplos meses futuros',
    ['4.2L'],
    ['generate'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
          timelineRow({ cycle_id: 'c-c', due_date: '2026-09-14' }),
        ],
      }),
    (ctx) => {
      expect(ctx.visual.history.generateCycleIds.length).toBe(3);
    }
  ),

  scenario(
    'retry-after-failure',
    'Retry após falha',
    ['4.2M', '4.2L'],
    ['cycle:failed', 'generate'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-failed',
            operational_state: 'failed',
            status_pt: 'Falha na geração',
            job_error_snippet: 'timeout',
            invoice_id: null,
          }),
        ],
        recent_jobs: [jobRow({ status: 'failed', error_message: 'timeout', cycle_key: '2026-07-14' })],
      }),
    (ctx) => {
      expect(ctx.visual.history.generateCycleIds).toContain('c-failed');
    }
  ),

  scenario(
    'gateway-failed',
    'Gateway failed',
    ['4.2N', '4.2M'],
    ['invoice:gateway_failed'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-gw',
            invoice_id: 'inv-gw',
            invoice_status: 'gateway_failed',
            operational_state: 'gateway_failed',
            status_pt: 'Falha no gateway',
            gateway_status: 'failed',
          }),
        ],
      }),
    (ctx) => {
      expect(ctx.visual.sidebar.alertKinds).toContain('gateway_failed');
    }
  ),

  scenario(
    'cycle-skipped',
    'Ciclo skipped',
    ['4.2M'],
    ['cycle:skipped'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-skipped',
            operational_state: 'skipped',
            status_pt: 'Ignorado',
            cycle_status: 'skipped',
            cycle_skipped_reason: 'manual_skip',
            invoice_id: null,
          }),
        ],
      })
  ),

  scenario(
    'cancelled-official',
    'Cancelled oficial',
    ['4.2M', '4.2N'],
    ['cycle:cancelled'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-official-cancel',
            operational_state: 'cancelled',
            status_pt: 'Cancelado',
            cycle_status: 'cancelled',
            invoice_id: null,
          }),
        ],
      })
  ),

  scenario(
    'cancelled-legacy',
    'Cancelled legado (falso cancelamento)',
    ['4.2N', '4.2L'],
    ['legacy', 'cycle:cancelled'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'active' },
        timeline: [
          timelineRow({
            cycle_id: 'c-legacy',
            operational_state: 'cancelled',
            status_pt: 'Cancelado',
            cycle_status: 'cancelled',
            invoice_id: null,
          }),
          timelineRow({ cycle_id: 'c-next', due_date: '2026-08-14' }),
        ],
      })
  ),

  scenario(
    'invoice-deleted',
    'Invoice deleted',
    ['4.2M'],
    ['invoice:due'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-deleted',
            invoice_id: null,
            operational_state: 'awaiting_generation',
            status_pt: 'Aguardando',
            cycle_status: 'pending',
          }),
        ],
      })
  ),

  scenario(
    'invoice-refund',
    'Invoice refund',
    ['4.2M'],
    ['invoice:paid'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-refund',
            invoice_id: 'inv-refund',
            invoice_status: 'refunded',
            operational_state: 'refunded',
            status_pt: 'Reembolsada',
          }),
        ],
      })
  ),

  scenario(
    'invoice-only',
    'Invoice_only (sem ciclo)',
    ['4.2M', '4.2N'],
    ['invoice:invoice_only'],
    () =>
      buildGoldenDetail({
        timeline: [invoiceOnlyRow({ due_date: '2026-06-15' })],
        cycles_raw: [],
      })
  ),

  scenario(
    'projection-only',
    'Projection (sem cycles_raw)',
    ['4.2H', '4.2M'],
    ['projection'],
    () =>
      buildGoldenDetail({
        timeline: [],
        cycles_raw: [],
        cycles_read_enabled: false,
      }),
    (ctx) => {
      expect(ctx.visual.calendar.projectedCount).toBeGreaterThan(0);
      expect(ctx.visual.history.rowCount).toBe(0);
    }
  ),

  scenario(
    'timeline-without-cycle',
    'Timeline sem ciclo',
    ['4.2N'],
    ['lifecycle'],
    () =>
      buildGoldenDetail({
        timeline: [lifecycleRow('pause')],
        cycles_raw: [],
      })
  ),

  scenario(
    'timeline-with-cycle',
    'Timeline com ciclo',
    ['4.2N', '4.2M'],
    ['subscription:active', 'cycle:pending'],
    () => buildGoldenDetail()
  ),

  scenario(
    'next-billing-date-changed',
    'Mudança de next_billing_date',
    ['4.2K', '4.2N'],
    ['subscription:active'],
    () =>
      buildGoldenDetail({
        subscription: { next_billing_date: '2026-09-01', current_period_end: '2026-09-01' },
        timeline: [timelineRow({ cycle_id: 'c-nbd', due_date: '2026-09-01' })],
      })
  ),

  scenario(
    'contract-interval-change',
    'Contrato alterando intervalo',
    ['4.2K'],
    ['subscription:active', 'lifecycle'],
    () =>
      buildGoldenDetail({
        subscription: { billing_interval: 'weekly', billing_cycle_count: 1 },
        meta: { periodicity_label_pt: 'Semanal' },
        timeline: [
          timelineRow({
            cycle_id: 'c-weekly',
            due_date: '2026-07-07',
            period_end: '2026-07-14',
          }),
        ],
      })
  ),

  scenario(
    'anchor-change',
    'Mudança de anchor',
    ['4.2K'],
    ['subscription:active'],
    () =>
      buildGoldenDetail({
        subscription: { billing_anchor_day: 1 },
        timeline: [timelineRow({ cycle_id: 'c-anchor', due_date: '2026-07-01', cycle_date: '2026-07-01' })],
      })
  ),

  scenario(
    'month-gap',
    'Mês inexistente (gap)',
    ['4.2L', '4.2N'],
    ['gap', 'generate'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-jul-gap', due_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c-nov-gap', due_date: '2026-11-14' }),
        ],
      })
  ),

  scenario(
    'gap-filled',
    'Gap preenchido',
    ['4.2L'],
    ['gap'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-14' }),
          timelineRow({ cycle_id: 'c-aug', due_date: '2026-08-14' }),
          timelineRow({ cycle_id: 'c-sep', due_date: '2026-09-14' }),
        ],
      })
  ),

  scenario(
    'reschedule',
    'Reschedule',
    ['4.2K', '4.2M'],
    ['job'],
    () =>
      buildGoldenDetail({
        timeline: [
          timelineRow({
            cycle_id: 'c-resched',
            due_date: '2026-07-20',
            job_id: 'job-resched',
          }),
        ],
        recent_jobs: [
          jobRow({
            id: 'job-resched',
            scheduled_at: '2026-07-20T08:00:00Z',
            status: 'pending',
            cycle_key: '2026-07-20',
          }),
        ],
      })
  ),

  scenario(
    'job-mismatch',
    'Job mismatch',
    ['4.2M', '4.2O'],
    ['job'],
    () =>
      buildGoldenDetail({
        timeline: [timelineRow({ cycle_id: 'c-mismatch', job_id: 'job-wrong' })],
        recent_jobs: [jobRow({ id: 'job-wrong', cycle_key: '2026-08-01', status: 'pending' })],
      })
  ),

  scenario(
    'job-reenqueue',
    'Job reenqueue',
    ['4.2K', '4.2M'],
    ['job'],
    () =>
      buildGoldenDetail({
        timeline: [timelineRow({ cycle_id: 'c-retry', job_id: 'job-retry' })],
        recent_jobs: [
          jobRow({
            id: 'job-retry',
            status: 'retrying',
            attempts: 2,
            retry_at: '2026-07-14T10:00:00Z',
          }),
        ],
      })
  ),

  scenario(
    'manual-renew',
    'Manual Renew (fixture)',
    ['4.2L', '4.2K'],
    ['generate', 'job'],
    () =>
      buildGoldenDetail({
        timeline: [timelineRow({ cycle_id: 'c-manual-renew', due_date: '2026-07-14', job_id: 'job-manual' })],
        recent_jobs: [
          jobRow({ id: 'job-manual', status: 'pending', completion_outcome: 'manual_generate' }),
        ],
      })
  ),

  scenario(
    'worker-renewal',
    'Worker Renewal (fixture)',
    ['4.2K', '4.2O'],
    ['job'],
    () =>
      buildGoldenDetail({
        automation_summary: {
          last_generation_at: '2026-07-14T08:05:00Z',
          last_generation_label: '14/07/2026 08:05',
          next_generation_ymd: '2026-08-14',
          next_charge_ymd: '2026-08-14',
          worker_status_pt: 'Processando',
          last_worker_check_at: '2026-07-14T08:00:00Z',
        },
        timeline: [timelineRow({ cycle_id: 'c-worker', job_id: 'job-worker' })],
        recent_jobs: [jobRow({ id: 'job-worker', status: 'processing' })],
      })
  ),

  scenario(
    'scheduler-renewal',
    'Scheduler Renewal (fixture)',
    ['4.2K', '4.2O'],
    ['job'],
    () =>
      buildGoldenDetail({
        automation_summary: {
          last_generation_at: null,
          last_generation_label: null,
          next_generation_ymd: '2026-07-14',
          next_charge_ymd: '2026-07-14',
          worker_status_pt: 'Agendado',
          last_worker_check_at: null,
        },
        timeline: [timelineRow({ cycle_id: 'c-sched', due_date: '2026-07-14' })],
        recent_jobs: [jobRow({ status: 'pending', scheduled_at: '2026-07-14T08:00:00Z' })],
      })
  ),

  scenario(
    'subscription-trial',
    'Assinatura trial',
    ['4.2K'],
    ['subscription:trial'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'trial', next_billing_date: '2026-07-14' },
        timeline: [],
        cycles_raw: [],
      })
  ),

  scenario(
    'subscription-pending-activation',
    'Assinatura pending_activation',
    ['4.2K'],
    ['subscription:active'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'pending_activation' as never },
        timeline: [],
        cycles_raw: [],
      })
  ),

  scenario(
    'subscription-expired',
    'Assinatura expired',
    ['4.2K'],
    ['subscription:cancelled'],
    () =>
      buildGoldenDetail({
        subscription: { status: 'expired' as never },
        timeline: [],
        cycles_raw: [],
      })
  ),
];

export const GOLDEN_SCENARIO_IDS = GOLDEN_SCENARIOS.map((s) => s.id);
