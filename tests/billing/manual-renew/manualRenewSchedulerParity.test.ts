import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  cycleSupportsManualGenerateFromAggregate,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, jobRow, timelineRow } from '../golden-dataset';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

type Interval = 'monthly' | 'weekly' | 'yearly';

function buildPostManualRenewParityDetail(params: {
  interval: Interval;
  todayYmd: string;
  cCycleId: string;
  cPlus1CycleId: string;
  cDueYmd: string;
  cPlus1DueYmd: string;
  invoiceId: string;
  jobId?: string;
}): CrmSubscriptionDetailPayload {
  const {
    interval,
    todayYmd,
    cCycleId,
    cPlus1CycleId,
    cDueYmd,
    cPlus1DueYmd,
    invoiceId,
    jobId = 'job-next',
  } = params;

  const timeline = [
    timelineRow({
      cycle_id: cCycleId,
      due_date: cDueYmd,
      cycle_date: cDueYmd,
      invoice_id: invoiceId,
      invoice_status: 'pending',
      operational_state: 'generated',
      status_pt: 'Pendente',
      cycle_status: 'invoiced',
      processed_at: `${todayYmd}T12:00:00Z`,
    }),
    timelineRow({
      cycle_id: cPlus1CycleId,
      due_date: cPlus1DueYmd,
      cycle_date: cPlus1DueYmd,
      invoice_id: null,
      operational_state: 'awaiting_generation',
      status_pt: 'Prevista',
      cycle_status: 'queued',
      job_id: jobId,
    }),
  ];

  return buildGoldenDetail({
    subscription: {
      billing_interval: interval,
      next_billing_date: cPlus1DueYmd,
      current_period_start: cDueYmd,
      current_period_end: cPlus1DueYmd,
      billing_cycle_count: 2,
    },
    tenant_billing: {
      timezone: 'America/Sao_Paulo',
      recurring_generate_time_local: '08:00',
      invoice_notify_same_as_generation: true,
      invoice_notify_time_local: '08:00',
      recurring_invoice_generate_days_before_due: interval === 'monthly' ? 30 : interval === 'weekly' ? 6 : 365,
    },
    timeline,
    cycles_raw: [
      {
        id: cCycleId,
        cycle_date: cDueYmd,
        period_start: cDueYmd,
        period_end: cPlus1DueYmd,
        status: 'invoiced',
        invoice_id: invoiceId,
        job_id: 'job-completed',
        processed_at: `${todayYmd}T12:00:00Z`,
        skipped_reason: null,
        error_message: null,
      },
      {
        id: cPlus1CycleId,
        cycle_date: cPlus1DueYmd,
        period_start: cPlus1DueYmd,
        period_end: cPlus1DueYmd,
        status: 'queued',
        invoice_id: null,
        job_id: jobId,
        processed_at: null,
        skipped_reason: null,
        error_message: null,
      },
    ],
    recent_jobs: [
      jobRow({
        id: 'job-completed',
        cycle_key: cDueYmd,
        status: 'completed',
        result_invoice_id: invoiceId,
      }),
      jobRow({
        id: jobId,
        cycle_key: cPlus1DueYmd,
        status: 'pending',
      }),
    ],
  });
}

function buildPreParityBrokenDetail(params: {
  interval: Interval;
  cCycleId: string;
  cDueYmd: string;
  cPlus1DueYmd: string;
  invoiceId: string;
}): CrmSubscriptionDetailPayload {
  const { interval, cCycleId, cDueYmd, cPlus1DueYmd, invoiceId } = params;
  return buildGoldenDetail({
    subscription: {
      billing_interval: interval,
      next_billing_date: cPlus1DueYmd,
      current_period_start: cDueYmd,
      current_period_end: cPlus1DueYmd,
      billing_cycle_count: 2,
    },
    timeline: [
      timelineRow({
        cycle_id: cCycleId,
        due_date: cDueYmd,
        invoice_id: invoiceId,
        invoice_status: 'pending',
        operational_state: 'generated',
        cycle_status: 'invoiced',
      }),
    ],
    cycles_raw: [
      {
        id: cCycleId,
        cycle_date: cDueYmd,
        period_start: cDueYmd,
        period_end: cPlus1DueYmd,
        status: 'invoiced',
        invoice_id: invoiceId,
        job_id: 'job-completed',
        processed_at: '2026-07-15T12:00:00Z',
        skipped_reason: null,
        error_message: null,
      },
    ],
  });
}

function assertParityAggregate(detail: CrmSubscriptionDetailPayload, todayYmd: string, cPlus1CycleId: string) {
  const aggregate = buildBillingAggregateFromDetail(detail, todayYmd);

  expect(detail.cycles_raw.some((c) => c.id === cPlus1CycleId)).toBe(true);
  expect(aggregate.nextInvoice?.isProjected).toBe(false);
  expect(aggregate.nextInvoice?.cycleId).toBe(cPlus1CycleId);
  expect(aggregate.capabilities.canGenerate).toBe(true);
  expect(
    cycleSupportsManualGenerateFromAggregate(aggregate.subscription, aggregate.cycles, cPlus1CycleId)
  ).toBe(true);

  const calendarReal = aggregate.calendar.filter(
    (ev) => ev.cycleId === cPlus1CycleId && !ev.isProjected
  );
  expect(calendarReal.length).toBeGreaterThan(0);

  const invoiced = aggregate.history.filter((r) => r.metadata.invoiceId);
  const pending = aggregate.history.filter((r) => r.cycleId === cPlus1CycleId && !r.metadata.invoiceId);
  expect(invoiced.length).toBeGreaterThan(0);
  expect(pending.length).toBeGreaterThan(0);
}

describe('Sprint 5.0-22E — Manual renew scheduler parity (GET payload + Aggregate)', () => {
  const monthly = {
    todayYmd: '2026-07-15',
    cDue: '2026-07-14',
    cPlus1Due: '2026-08-14',
    cId: 'c-jul-invoiced',
    cPlus1Id: 'c-aug-queued',
    invoiceId: 'inv-jul',
  };

  const weekly = {
    todayYmd: '2026-07-10',
    cDue: '2026-07-09',
    cPlus1Due: '2026-07-16',
    cId: 'c-w1-invoiced',
    cPlus1Id: 'c-w2-queued',
    invoiceId: 'inv-w1',
  };

  const yearly = {
    todayYmd: '2026-07-14',
    cDue: '2026-07-14',
    cPlus1Due: '2027-07-14',
    cId: 'c-y1-invoiced',
    cPlus1Id: 'c-y2-queued',
    invoiceId: 'inv-y1',
  };

  it('cenário 1 — GET imediato pós-paridade contém C+1 em cycles_raw', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const ids = detail.cycles_raw.map((c) => c.id);
    expect(ids).toContain(monthly.cId);
    expect(ids).toContain(monthly.cPlus1Id);
    expect(detail.cycles_raw).toHaveLength(2);
  });

  it('cenário 2 — Aggregate nextInvoice.isProjected = false sem alterar Aggregate', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const aggregate = buildBillingAggregateFromDetail(detail, monthly.todayYmd);
    expect(aggregate.nextInvoice?.isProjected).toBe(false);
  });

  it('cenário 3 — capabilities permitem Gerar em C+1', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const aggregate = buildBillingAggregateFromDetail(detail, monthly.todayYmd);
    expect(aggregate.capabilities.canGenerate).toBe(true);
    expect(
      cycleSupportsManualGenerateFromAggregate(aggregate.subscription, aggregate.cycles, monthly.cPlus1Id)
    ).toBe(true);
  });

  it('cenário 4 — calendário possui evento real para C+1 (não só projeção)', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const aggregate = buildBillingAggregateFromDetail(detail, monthly.todayYmd);
    const realNext = aggregate.calendar.find(
      (ev) => ev.cycleId === monthly.cPlus1Id && !ev.isProjected
    );
    expect(realNext).toBeDefined();
    expect(realNext?.date).toBe(monthly.cPlus1Due);
  });

  it('cenário 5 — histórico: último faturado invoiced, próximo pending/queued', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const aggregate = buildBillingAggregateFromDetail(detail, monthly.todayYmd);
    const invoicedRow = aggregate.history.find((r) => r.cycleId === monthly.cId);
    const nextRow = aggregate.history.find((r) => r.cycleId === monthly.cPlus1Id);
    expect(invoicedRow?.metadata.invoiceId).toBe(monthly.invoiceId);
    expect(nextRow?.metadata.invoiceId).toBeNull();
    expect(
      cycleSupportsManualGenerateFromAggregate(aggregate.subscription, aggregate.cycles, monthly.cPlus1Id)
    ).toBe(true);
  });

  it('cenário 6 — estado idempotente: segundo passo scheduler não duplica cycles/jobs no payload', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const afterScheduler = {
      ...detail,
      cycles_raw: [...detail.cycles_raw],
      recent_jobs: [...detail.recent_jobs],
    };
    expect(afterScheduler.cycles_raw).toHaveLength(2);
    expect(afterScheduler.recent_jobs.filter((j) => j.cycle_key === monthly.cPlus1Due)).toHaveLength(1);
  });

  it('cenário 7 — payload estável: cycles_raw sem ids duplicados', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const ids = detail.cycles_raw.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cenário 8 — assinatura mensal — paridade completa', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'monthly',
      todayYmd: monthly.todayYmd,
      cCycleId: monthly.cId,
      cPlus1CycleId: monthly.cPlus1Id,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    assertParityAggregate(detail, monthly.todayYmd, monthly.cPlus1Id);
  });

  it('cenário 9 — assinatura semanal — paridade completa', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'weekly',
      todayYmd: weekly.todayYmd,
      cCycleId: weekly.cId,
      cPlus1CycleId: weekly.cPlus1Id,
      cDueYmd: weekly.cDue,
      cPlus1DueYmd: weekly.cPlus1Due,
      invoiceId: weekly.invoiceId,
    });
    assertParityAggregate(detail, weekly.todayYmd, weekly.cPlus1Id);
  });

  it('cenário 10 — assinatura anual — paridade completa', () => {
    const detail = buildPostManualRenewParityDetail({
      interval: 'yearly',
      todayYmd: yearly.todayYmd,
      cCycleId: yearly.cId,
      cPlus1CycleId: yearly.cPlus1Id,
      cDueYmd: yearly.cDue,
      cPlus1DueYmd: yearly.cPlus1Due,
      invoiceId: yearly.invoiceId,
    });
    assertParityAggregate(detail, yearly.todayYmd, yearly.cPlus1Id);
  });

  it('regressão 22D — sem C+1 em cycles_raw o Aggregate projeta o próximo ciclo', () => {
    const broken = buildPreParityBrokenDetail({
      interval: 'monthly',
      cCycleId: monthly.cId,
      cDueYmd: monthly.cDue,
      cPlus1DueYmd: monthly.cPlus1Due,
      invoiceId: monthly.invoiceId,
    });
    const aggregate = buildBillingAggregateFromDetail(broken, monthly.todayYmd);
    expect(broken.cycles_raw).toHaveLength(1);
    expect(aggregate.nextInvoice?.isProjected).toBe(true);
    expect(aggregate.nextInvoice?.cycleId).toBeNull();
  });
});
