import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildFinancialEventsFromAggregate,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  mapCycleToFinancialEvent,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'subscriptionFinancialEventBuilder',
  'subscriptionFinancialProjection',
  'subscriptionFinancialEventStore',
  'FinancialEventStore',
  'billingStateMachine',
  'subscriptionTimelineUx',
  'subscriptionFinancialExperience',
  'subscriptionFinancialConsistency',
  'resolveOperationalState',
  'resolveInvoiceCapabilities',
  'cycleSupportsManualGenerate',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const FINANCIAL_EVENT_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/financialEventSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_EVENT_FIELDS = [
  'id',
  'cycleId',
  'subscriptionId',
  'eventType',
  'dueYmd',
  'occurredAt',
  'status',
  'kind',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('FinancialEventStage', () => {
  it('módulo financialEventSnapshot não importa motor legado', () => {
    const source = readModuleSource(FINANCIAL_EVENT_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toMatch(new RegExp(`from ['"].*${forbidden}`));
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/operational_state/);
  });

  it('FinancialEventStage no builder não referencia context.source para eventos', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const financialEventStage'),
      builder.indexOf('export const historyStage')
    );
    expect(stageBlock).toContain('buildFinancialEventsFromAggregate');
    expect(stageBlock).toContain('aggregate.subscription');
    expect(stageBlock).toContain('aggregate.cycles');
    expect(stageBlock).not.toContain('context.source');
  });

  it('gera ≥1 evento por ciclo com cycleId obrigatório', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.events.length).toBeGreaterThanOrEqual(2);
    expect(aggregate.events.every((e) => e.cycleId || e.metadata.invoiceId)).toBe(true);
    expect(new Set(aggregate.events.map((e) => e.id)).size).toBe(aggregate.events.length);
  });

  it('nenhum evento duplicado por id', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    const ids = aggregate.events.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it.each(REQUIRED_EVENT_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.events[0]).toHaveProperty(field);
  });

  it('mapeia status pending → upcoming_cycle (paridade legado)', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.events[0]?.eventType).toBe('upcoming_cycle');
    expect(aggregate.events[0]?.status).toBe('pending');
  });

  it('occurredAt usa paid_at da invoice quando paga', () => {
    const subscription = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30').subscription;
    const invoice = {
      id: 'inv-1',
      subscription_cycle_id: 'c-paid',
      status: 'paid',
      amount_cents: 11_000,
      due_date: '2026-06-14',
      period_start: '2026-06-07',
      period_end: '2026-07-07',
      created_at: '2026-06-14T10:00:00Z',
      gateway_status: null,
      gateway_reference_id: null,
      invoice_type: null,
      paid_at: '2026-06-14T12:00:00Z',
      refunded_at: null,
    };
    const event = mapCycleToFinancialEvent(
      {
        id: 'c-paid',
        subscriptionId: 'sub-golden',
        cycleDate: '2026-06-14',
        periodStart: '2026-06-07',
        periodEnd: '2026-07-07',
        status: 'invoiced',
        invoiceId: 'inv-1',
        jobId: null,
        processedAt: '2026-06-14T12:00:00Z',
        skippedReason: null,
        errorMessage: null,
        metadata: {},
      },
      subscription,
      '2026-06-30',
      invoice
    );
    expect(event?.occurredAt).toBe('2026-06-14T12:00:00Z');
    expect(event?.eventType).toBe('payment');
    expect(event?.dueYmd).toBe('2026-06-14');
  });

  it('payment dueYmd usa due_date da invoice, não paid_at (Sprint 5.0-24A)', () => {
    const subscription = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30').subscription;
    const invoice = {
      id: 'inv-late-pay',
      subscription_cycle_id: 'c-late',
      status: 'paid',
      amount_cents: 11_000,
      due_date: '2026-07-16',
      period_start: '2026-07-16',
      period_end: '2026-07-23',
      created_at: '2026-07-16T10:00:00Z',
      gateway_status: null,
      gateway_reference_id: null,
      invoice_type: null,
      paid_at: '2026-07-07T12:00:00Z',
      refunded_at: null,
    };
    const event = mapCycleToFinancialEvent(
      {
        id: 'c-late',
        subscriptionId: 'sub-golden',
        cycleDate: '2026-07-16',
        periodStart: '2026-07-16',
        periodEnd: '2026-07-23',
        status: 'invoiced',
        invoiceId: 'inv-late-pay',
        jobId: null,
        processedAt: null,
        skippedReason: null,
        errorMessage: null,
        metadata: {},
      },
      subscription,
      '2026-07-07',
      invoice
    );
    expect(event?.eventType).toBe('payment');
    expect(event?.dueYmd).toBe('2026-07-16');
    expect(event?.occurredAt).toBe('2026-07-07T12:00:00Z');
  });

  it('cycles vazios produzem events vazios', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.events).toEqual([]);
  });

  it('financialEventStage isolada usa apenas aggregate (não context)', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    const beforeCycles = aggregate.cycles;
    const result = financialEventStage(context, aggregate);
    expect(result.events).toEqual(
      buildFinancialEventsFromAggregate(
        result.subscription,
        beforeCycles,
        result.invoices,
        context.todayYmd
      )
    );
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — events reais determinísticos',
    (_id, scenario) => {
      const detail = scenario.build();
      const a = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      const b = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(a.events).toEqual(b.events);
      expect(a.events.every((e) => e.kind === 'real')).toBe(true);
      if (a.subscription.status === 'cancelled' && a.events.length > 0) {
        expect(
          a.events.every((e) =>
            ['payment', 'invoice_refunded', 'cycle_cancelled', 'invoice_due'].includes(e.eventType)
          )
        ).toBe(true);
      }
    }
  );
});
