import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildSidebarFromAggregate,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  calendarStage,
  historyStage,
  sidebarStage,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'subscriptionFinancialExperience',
  'billingSubscriptionExperience',
  'billingSubscriptionExperiencePolish',
  'subscriptionFinancialConsistency',
  'subscriptionFinancialProjection',
  'subscriptionFinancialEventStore',
  'FinancialEventStore',
  'subscriptionTimelineUx',
  'subscriptionCyclesSource',
  'billingStateMachine',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SIDEBAR_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/sidebarSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_SIDEBAR_FIELDS = [
  'subscriptionStatus',
  'subscriptionType',
  'billingInterval',
  'currency',
  'amount',
  'eventCount',
  'lastEventDate',
  'lastEventType',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('SidebarStage', () => {
  it('módulo sidebarSnapshot não importa motor legado', () => {
    const source = readModuleSource(SIDEBAR_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('SidebarStage no builder usa apenas subscription e events', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const sidebarStage'),
      builder.indexOf('export const nextInvoiceStage')
    );
    expect(stageBlock).toContain('buildSidebarFromAggregate');
    expect(stageBlock).toContain('aggregate.subscription');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).not.toContain('context.source');
    expect(stageBlock).not.toContain('aggregate.cycles');
  });

  it('popula sidebar a partir de subscription e events', () => {
    const detail = buildGoldenDetail();
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const sub = aggregate.subscription;

    expect(aggregate.sidebar.subscriptionStatus).toBe(sub.status);
    expect(aggregate.sidebar.subscriptionType).toBe(sub.subscriptionType);
    expect(aggregate.sidebar.billingInterval).toBe(sub.billingInterval);
    expect(aggregate.sidebar.currency).toBe(sub.currency);
    expect(aggregate.sidebar.amount).toBe(sub.amount);
    expect(aggregate.sidebar.eventCount).toBe(aggregate.events.length);
    expect(aggregate.sidebar.metadata.subscriptionId).toBe(sub.id);
  });

  it.each(REQUIRED_SIDEBAR_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.sidebar).toHaveProperty(field);
  });

  it('lastEventDate e lastEventType refletem o evento mais recente', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-early',
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
          id: 'c-late',
          cycle_date: '2026-09-14',
          period_start: '2026-09-07',
          period_end: '2026-10-07',
          status: 'paid',
          invoice_id: 'inv-1',
          job_id: null,
          processed_at: '2026-09-14T12:00:00Z',
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.sidebar.lastEventDate).toBe('2026-09-14T12:00:00Z');
    expect(aggregate.sidebar.lastEventType).toBe('payment');
    expect(aggregate.sidebar.eventCount).toBe(2);
  });

  it('events vazios: eventCount 0 e lastEvent nulos', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.sidebar.eventCount).toBe(0);
    expect(aggregate.sidebar.lastEventDate).toBeNull();
    expect(aggregate.sidebar.lastEventType).toBeNull();
    expect(aggregate.sidebar.subscriptionStatus).toBe(aggregate.subscription.status);
  });

  it('sidebarStage isolada usa apenas subscription e events do aggregate', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    const result = sidebarStage(context, aggregate);
    expect(result.sidebar).toEqual(
      buildSidebarFromAggregate(aggregate.subscription, aggregate.events)
    );
  });

  it('não depende de cycles para o resumo', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-only', due_date: '2026-07-14' })],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const fromEventsOnly = buildSidebarFromAggregate(aggregate.subscription, aggregate.events);
    expect(aggregate.sidebar).toEqual(fromEventsOnly);
    expect(aggregate.sidebar.eventCount).toBe(aggregate.events.length);
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — sidebar alinhada a subscription e events',
    (_id, scenario) => {
      const detail = scenario.build();
      const aggregate = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(aggregate.sidebar.subscriptionStatus).toBe(aggregate.subscription.status);
      expect(aggregate.sidebar.amount).toBe(aggregate.subscription.amount);
      expect(aggregate.sidebar.eventCount).toBe(aggregate.events.length);
      expect(aggregate.sidebar.metadata.subscriptionId).toBe(aggregate.subscription.id);
      if (aggregate.events.length === 0) {
        expect(aggregate.sidebar.lastEventDate).toBeNull();
        expect(aggregate.sidebar.lastEventType).toBeNull();
      } else {
        expect(aggregate.sidebar.lastEventDate).toBeTruthy();
        expect(aggregate.sidebar.lastEventType).toBeTruthy();
      }
    }
  );
});
