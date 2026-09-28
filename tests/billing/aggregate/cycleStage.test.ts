import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  mapCycleSnapshot,
  mapCyclesFromSource,
  snapshotBillingContextSource,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';

const REQUIRED_FIELDS = [
  'id',
  'subscriptionId',
  'cycleDate',
  'periodStart',
  'periodEnd',
  'status',
  'invoiceId',
  'jobId',
  'processedAt',
  'skippedReason',
  'errorMessage',
  'metadata',
] as const;

describe('CycleStage', () => {
  it('aggregate.cycles tem a mesma quantidade de cycles_raw', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
        timelineRow({ cycle_id: 'c-c', due_date: '2026-09-14' }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.cycles).toHaveLength(detail.cycles_raw.length);
    expect(aggregate.cycles).toHaveLength(3);
  });

  it('preserva IDs, status e ordem (1:1)', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-first',
          cycle_date: '2026-07-14',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: 'c-second',
          cycle_date: '2026-10-14',
          period_start: '2026-10-07',
          period_end: '2026-11-07',
          status: 'failed',
          invoice_id: null,
          job_id: 'job-1',
          processed_at: null,
          skipped_reason: null,
          error_message: 'timeout',
        },
        {
          id: 'c-third',
          cycle_date: '2026-05-14',
          period_start: '2026-05-07',
          period_end: '2026-06-07',
          status: 'cancelled',
          invoice_id: 'inv-x',
          job_id: null,
          processed_at: '2026-05-15T10:00:00Z',
          skipped_reason: null,
          error_message: null,
        },
      ],
    });

    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.cycles.map((c) => c.id)).toEqual(['c-first', 'c-second', 'c-third']);
    expect(aggregate.cycles.map((c) => c.status)).toEqual(['pending', 'failed', 'cancelled']);
  });

  it('mapeia campos canônicos do Golden Dataset', () => {
    const detail = buildGoldenDetail();
    const raw = detail.cycles_raw[0]!;
    const mapped = mapCycleSnapshot(raw, detail.subscription.id);

    expect(mapped).toEqual({
      id: raw.id,
      subscriptionId: detail.subscription.id,
      cycleDate: raw.cycle_date,
      periodStart: raw.period_start,
      periodEnd: raw.period_end,
      status: raw.status,
      invoiceId: raw.invoice_id,
      jobId: raw.job_id,
      processedAt: raw.processed_at,
      skippedReason: raw.skipped_reason,
      errorMessage: raw.error_message,
      metadata: {},
    });
  });

  it.each(REQUIRED_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.cycles[0]).toHaveProperty(field);
  });

  it('campos extras vão para metadata', () => {
    const cycle = {
      id: 'c-meta',
      cycle_date: '2026-07-14',
      period_start: '2026-07-07',
      period_end: '2026-08-07',
      status: 'pending',
      invoice_id: null,
      job_id: null,
      processed_at: null,
      skipped_reason: null,
      error_message: null,
      custom_trace_id: 'trace-abc',
    } as never;
    const mapped = mapCycleSnapshot(cycle, 'sub-golden');
    expect(mapped.metadata).toEqual({ custom_trace_id: 'trace-abc' });
  });

  it('subscription_id no row sobrescreve fallback do context', () => {
    const cycle = {
      id: 'c-sub',
      subscription_id: 'sub-explicit',
      cycle_date: '2026-07-14',
      period_start: '2026-07-07',
      period_end: '2026-08-07',
      status: 'pending',
      invoice_id: null,
      job_id: null,
      processed_at: null,
      skipped_reason: null,
      error_message: null,
    } as never;
    expect(mapCycleSnapshot(cycle, 'sub-fallback').subscriptionId).toBe('sub-explicit');
  });

  it('cycles_raw vazio produz aggregate.cycles vazio', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.cycles).toEqual([]);
  });

  it('não altera BillingContext.source', () => {
    const detail = buildGoldenDetail();
    const context = createBillingContext(detail, '2026-06-30');
    const before = snapshotBillingContextSource(detail);
    cycleStage(context, createEmptyBillingAggregate(context));
    expect(snapshotBillingContextSource(detail)).toBe(before);
  });

  it('cycleStage isolada não popula history/calendar; pipeline completo preenche ambos', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const afterCycles = cycleStage(context, createEmptyBillingAggregate(context));
    expect(afterCycles.history).toEqual([]);
    expect(afterCycles.calendar).toEqual([]);

    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.history).toHaveLength(aggregate.events.length);
    expect(aggregate.calendar.length).toBeGreaterThanOrEqual(aggregate.events.length);
  });

  it('mapCyclesFromSource é determinístico', () => {
    const detail = buildGoldenDetail();
    const a = mapCyclesFromSource(detail.cycles_raw, detail.subscription.id);
    const b = mapCyclesFromSource(detail.cycles_raw, detail.subscription.id);
    expect(a).toEqual(b);
  });
});
