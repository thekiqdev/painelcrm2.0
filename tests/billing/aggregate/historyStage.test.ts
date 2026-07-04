import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildHistoryFromEvents,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  historyStage,
  mapEventToHistoryRow,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'subscriptionFinancialEventBuilder',
  'subscriptionFinancialEvents',
  'subscriptionFinancialProjection',
  'subscriptionFinancialEventStore',
  'FinancialEventStore',
  'billingStateMachine',
  'subscriptionTimelineUx',
  'subscriptionCyclesSource',
  'resolveHistoryRowState',
  'cycleSupportsManualGenerate',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/historySnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_HISTORY_FIELDS = [
  'id',
  'eventId',
  'cycleId',
  'subscriptionId',
  'type',
  'status',
  'date',
  'title',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('HistoryStage', () => {
  it('módulo historySnapshot não importa motor legado', () => {
    const source = readModuleSource(HISTORY_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toMatch(new RegExp(`from ['"].*${forbidden}`));
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('HistoryStage no builder usa apenas aggregate.events', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const historyStage'),
      builder.indexOf('export const calendarStage')
    );
    expect(stageBlock).toContain('buildHistoryFromEvents');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).not.toContain('context.source');
    expect(stageBlock).not.toContain('aggregate.cycles');
    expect(stageBlock).not.toContain('aggregate.subscription');
  });

  it('history.length === events.length (1 evento = 1 linha)', () => {
    const detail = buildGoldenDetail({
      timeline: [
        timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c-b', due_date: '2026-08-14' }),
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.history).toHaveLength(aggregate.events.length);
    expect(aggregate.history).toHaveLength(2);
  });

  it('cada HistoryRow referencia um Event existente', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    const eventIds = new Set(aggregate.events.map((e) => e.id));
    for (const row of aggregate.history) {
      expect(eventIds.has(row.eventId)).toBe(true);
    }
  });

  it.each(REQUIRED_HISTORY_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.history[0]).toHaveProperty(field);
  });

  it('ordena por dueYmd desc (paridade legado)', () => {
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
    expect(aggregate.history.map((r) => r.cycleId)).toEqual(['c-late', 'c-early']);
    for (let i = 1; i < aggregate.history.length; i++) {
      expect(aggregate.history[i - 1]!.date.localeCompare(aggregate.history[i]!.date)).toBeGreaterThanOrEqual(
        0
      );
    }
  });

  it('events vazios produzem history vazio', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.history).toEqual([]);
  });

  it('historyStage isolada usa apenas events do aggregate', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    const events = aggregate.events;
    const result = historyStage(context, aggregate);
    expect(result.history).toEqual(buildHistoryFromEvents(events));
  });

  it('mapEventToHistoryRow copia campos do evento sem inventar dados', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    const event = aggregate.events[0]!;
    const row = mapEventToHistoryRow(event);
    expect(row.eventId).toBe(event.id);
    expect(row.cycleId).toBe(event.cycleId);
    expect(row.subscriptionId).toBe(event.subscriptionId);
    expect(row.type).toBe(event.eventType);
    expect(row.status).toBe(event.status);
    expect(row.date).toBe(event.occurredAt);
    expect(row.title.length).toBeGreaterThan(0);
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — history.length === events.length e eventIds válidos',
    (_id, scenario) => {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(aggregate.history).toHaveLength(aggregate.events.length);
      const eventIds = new Set(aggregate.events.map((e) => e.id));
      for (const row of aggregate.history) {
        expect(eventIds.has(row.eventId)).toBe(true);
      }
    }
  );
});
