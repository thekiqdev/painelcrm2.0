import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  calendarStage,
  historyStage,
  nextInvoiceStage,
  resolveNextInvoiceFromEvents,
  sidebarStage,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'subscriptionNextInvoiceResolver',
  'resolveNextChargePresentation',
  'subscriptionFinancialProjection',
  'subscriptionFinancialEventBuilder',
  'subscriptionFinancialEventStore',
  'FinancialEventStore',
  'subscriptionTimelineUx',
  'subscriptionCyclesSource',
  'billingStateMachine',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NEXT_INVOICE_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/nextInvoiceSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_NEXT_INVOICE_FIELDS = [
  'eventId',
  'cycleId',
  'subscriptionId',
  'eventType',
  'date',
  'status',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('NextInvoiceStage', () => {
  it('módulo nextInvoiceSnapshot não importa motor legado', () => {
    const source = readModuleSource(NEXT_INVOICE_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('NextInvoiceStage no builder usa apenas aggregate.events', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const nextInvoiceStage'),
      builder.indexOf('export const alertStage')
    );
    expect(stageBlock).toContain('resolveNextInvoiceFromEvents');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).not.toContain('context.source');
    expect(stageBlock).not.toContain('aggregate.cycles');
    expect(stageBlock).not.toContain('aggregate.subscription');
  });

  it('seleciona o evento mais antigo (cronologia crescente)', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-late',
          cycle_date: '2026-09-14',
          period_start: '2026-09-07',
          period_end: '2026-10-07',
          status: 'pending',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
        {
          id: 'c-early',
          cycle_date: '2026-07-14',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          status: 'paid',
          invoice_id: 'inv-1',
          job_id: null,
          processed_at: '2026-07-14T12:00:00Z',
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.nextInvoice).not.toBeNull();
    expect(aggregate.nextInvoice!.cycleId).toBe('c-early');
    expect(aggregate.nextInvoice!.date).toBe('2026-07-14T12:00:00Z');
    expect(aggregate.nextInvoice!.eventType).toBe('payment');
  });

  it('eventId referencia um FinancialEvent existente', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.nextInvoice).not.toBeNull();
    const eventIds = new Set(aggregate.events.map((e) => e.id));
    expect(eventIds.has(aggregate.nextInvoice!.eventId)).toBe(true);
  });

  it.each(REQUIRED_NEXT_INVOICE_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.nextInvoice).toHaveProperty(field);
  });

  it('events vazios produzem nextInvoice null', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.nextInvoice).toBeNull();
    expect(resolveNextInvoiceFromEvents([])).toBeNull();
  });

  it('mesmo Aggregate produz sempre o mesmo NextInvoice', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
      ],
    });
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(a.nextInvoice).toEqual(b.nextInvoice);
  });

  it('nextInvoiceStage isolada usa apenas events do aggregate', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    aggregate = sidebarStage(context, aggregate);
    const events = aggregate.events;
    const result = nextInvoiceStage(context, aggregate);
    expect(result.nextInvoice).toEqual(resolveNextInvoiceFromEvents(events));
  });

  it('empate por occurredAt resolve por id', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-b',
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
          id: 'c-a',
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
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    // event ids are billing-event-{cycleId}; billing-event-c-a < billing-event-c-b
    expect(aggregate.nextInvoice!.cycleId).toBe('c-a');
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — nextInvoice alinhado a events',
    (_id, scenario) => {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      if (aggregate.events.length === 0) {
        expect(aggregate.nextInvoice).toBeNull();
      } else {
        expect(aggregate.nextInvoice).not.toBeNull();
        const eventIds = new Set(aggregate.events.map((e) => e.id));
        expect(eventIds.has(aggregate.nextInvoice!.eventId)).toBe(true);
        expect(aggregate.nextInvoice).toEqual(resolveNextInvoiceFromEvents(aggregate.events));
      }
    }
  );
});
