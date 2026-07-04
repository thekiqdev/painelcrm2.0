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
      expect(source).not.toMatch(new RegExp(`from ['"].*${forbidden}`));
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('NextInvoiceStage usa subscription, cycles e events (first eligible)', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const nextInvoiceStage'),
      builder.indexOf('export const sidebarStage')
    );
    expect(stageBlock).toContain('resolveNextInvoiceFromAggregate');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).toContain('aggregate.cycles');
    expect(stageBlock).not.toContain('context.source');
  });

  it('seleciona o first eligible cycle (sem invoice)', () => {
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
    expect(aggregate.nextInvoice!.cycleId).toBe('c-late');
    expect(aggregate.nextInvoice!.date).toBe('2026-09-14');
    expect(aggregate.nextInvoice!.isProjected).toBe(false);
  });

  it('eventId referencia um FinancialEvent existente quando real', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.nextInvoice).not.toBeNull();
    expect(aggregate.nextInvoice!.isProjected).toBe(false);
    const eventIds = new Set(aggregate.events.map((e) => e.id));
    expect(eventIds.has(aggregate.nextInvoice!.eventId!)).toBe(true);
  });

  it.each(REQUIRED_NEXT_INVOICE_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.nextInvoice).toHaveProperty(field);
  });

  it('sem cycles elegíveis usa projeção a partir de next_billing_date', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.nextInvoice).not.toBeNull();
    expect(aggregate.nextInvoice!.isProjected).toBe(true);
    expect(aggregate.nextInvoice!.cycleId).toBeNull();
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

  it('nextInvoiceStage isolada usa first eligible cycle', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    const result = nextInvoiceStage(context, aggregate);
    expect(result.nextInvoice?.cycleId).toBe(aggregate.cycles[0]?.id);
    expect(result.nextInvoice?.isProjected).toBe(false);
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
    '%s — nextInvoice determinístico',
    (_id, scenario) => {
      const detail = scenario.build();
      const a = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      const b = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(a.nextInvoice).toEqual(b.nextInvoice);
      if (a.nextInvoice && !a.nextInvoice.isProjected && a.nextInvoice.eventId) {
        const eventIds = new Set(a.events.map((e) => e.id));
        expect(eventIds.has(a.nextInvoice.eventId)).toBe(true);
      }
    }
  );
});
