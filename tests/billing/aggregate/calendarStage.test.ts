import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildCalendarFromEvents,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  calendarStage,
  historyStage,
  mapEventToCalendarEntry,
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
  'subscriptionCyclesSource',
  'resolveInvoiceCapabilities',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CALENDAR_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/calendarSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_CALENDAR_FIELDS = [
  'id',
  'eventId',
  'cycleId',
  'subscriptionId',
  'date',
  'eventType',
  'status',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('CalendarStage', () => {
  it('módulo calendarSnapshot não importa motor legado', () => {
    const source = readModuleSource(CALENDAR_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('CalendarStage no builder usa apenas aggregate.events', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const calendarStage'),
      builder.indexOf('export const sidebarStage')
    );
    expect(stageBlock).toContain('buildCalendarFromEvents');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).not.toContain('context.source');
    expect(stageBlock).not.toContain('aggregate.cycles');
    expect(stageBlock).not.toContain('aggregate.subscription');
  });

  it('calendar.length === events.length (1 evento = 1 entrada)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.calendar).toHaveLength(aggregate.events.length);
    expect(aggregate.calendar).toHaveLength(2);
  });

  it('cada CalendarEntry referencia um Event existente', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    const eventIds = new Set(aggregate.events.map((e) => e.id));
    for (const entry of aggregate.calendar) {
      expect(eventIds.has(entry.eventId)).toBe(true);
    }
  });

  it('History e Calendar compartilham a mesma origem (events)', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.history).toHaveLength(aggregate.events.length);
    expect(aggregate.calendar).toHaveLength(aggregate.events.length);

    const historyEventIds = aggregate.history.map((r) => r.eventId).sort();
    const calendarEventIds = aggregate.calendar.map((e) => e.eventId).sort();
    const eventIds = aggregate.events.map((e) => e.id).sort();

    expect(historyEventIds).toEqual(eventIds);
    expect(calendarEventIds).toEqual(eventIds);
  });

  it.each(REQUIRED_CALENDAR_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.calendar[0]).toHaveProperty(field);
  });

  it('ordena cronologicamente por date (occurredAt)', () => {
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
    expect(aggregate.calendar.map((e) => e.cycleId)).toEqual(['c-early', 'c-late']);
    expect(aggregate.history.map((r) => r.cycleId)).toEqual(aggregate.calendar.map((e) => e.cycleId));
  });

  it('events vazios produzem calendar vazio', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.calendar).toEqual([]);
  });

  it('calendarStage isolada usa apenas events do aggregate', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    const events = aggregate.events;
    const result = calendarStage(context, aggregate);
    expect(result.calendar).toEqual(buildCalendarFromEvents(events));
  });

  it('mapEventToCalendarEntry copia campos do evento sem inventar dados', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    const event = aggregate.events[0]!;
    const entry = mapEventToCalendarEntry(event);
    expect(entry.eventId).toBe(event.id);
    expect(entry.cycleId).toBe(event.cycleId);
    expect(entry.subscriptionId).toBe(event.subscriptionId);
    expect(entry.eventType).toBe(event.eventType);
    expect(entry.status).toBe(event.status);
    expect(entry.date).toBe(event.occurredAt);
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — calendar.length === history.length === events.length',
    (_id, scenario) => {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(aggregate.calendar).toHaveLength(aggregate.events.length);
      expect(aggregate.history).toHaveLength(aggregate.events.length);
      const eventIds = new Set(aggregate.events.map((e) => e.id));
      for (const entry of aggregate.calendar) {
        expect(eventIds.has(entry.eventId)).toBe(true);
      }
    }
  );
});
