import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildAlertsFromAggregate,
  buildBillingAggregateFromDetail,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  calendarStage,
  historyStage,
  nextInvoiceStage,
  alertStage,
  sidebarStage,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'subscriptionFinancialExperience',
  'billingSubscriptionExperience',
  'subscriptionFinancialEventStore',
  'FinancialEventStore',
  'billingStateMachine',
  'subscriptionTimelineUx',
  'subscriptionFinancialProjection',
  'resolveHistoryRowState',
  'resolveInvoiceCapabilities',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALERTS_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/alertsSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_ALERT_FIELDS = [
  'id',
  'kind',
  'severity',
  'title',
  'description',
  'eventId',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('AlertsStage', () => {
  it('módulo alertsSnapshot não importa motor legado', () => {
    const source = readModuleSource(ALERTS_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('AlertsStage no builder usa subscription, events e nextInvoice', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const alertStage'),
      builder.indexOf('export const capabilityStage')
    );
    expect(stageBlock).toContain('buildAlertsFromAggregate');
    expect(stageBlock).toContain('aggregate.subscription');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).toContain('aggregate.nextInvoice');
    expect(stageBlock).not.toContain('context.source');
    expect(stageBlock).not.toContain('aggregate.cycles');
  });

  it.each(REQUIRED_ALERT_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.alerts.length).toBeGreaterThan(0);
    expect(aggregate.alerts[0]).toHaveProperty(field);
  });

  it('emite no_events quando não há FinancialEvents', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.alerts.some((a) => a.kind === 'no_events')).toBe(true);
    expect(aggregate.alerts.some((a) => a.kind === 'next_invoice')).toBe(false);
  });

  it('emite next_invoice quando nextInvoice está presente', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.nextInvoice).not.toBeNull();
    const alert = aggregate.alerts.find((a) => a.kind === 'next_invoice');
    expect(alert).toBeDefined();
    expect(alert!.eventId).toBe(aggregate.nextInvoice!.eventId);
  });

  it('emite invoice_failed para eventos de falha', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-fail',
          cycle_date: '2026-07-14',
          period_start: '2026-07-07',
          period_end: '2026-08-07',
          status: 'failed',
          invoice_id: null,
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: 'timeout',
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const failed = aggregate.alerts.filter((a) => a.kind === 'invoice_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.eventId).toBe('billing-event-c-fail');
    expect(failed[0]!.severity).toBe('error');
  });

  it('emite subscription_status para assinatura pausada', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ subscription: { status: 'paused' }, timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.alerts.some((a) => a.kind === 'subscription_status')).toBe(true);
  });

  it('mesmo Aggregate gera sempre os mesmos Alerts', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' })],
    });
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(a.alerts).toEqual(b.alerts);
  });

  it('alertStage isolada usa apenas subscription, events e nextInvoice', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    aggregate = sidebarStage(context, aggregate);
    aggregate = nextInvoiceStage(context, aggregate);
    const result = alertStage(context, aggregate);
    expect(result.alerts).toEqual(
      buildAlertsFromAggregate(aggregate.subscription, aggregate.events, aggregate.nextInvoice)
    );
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — alerts determinísticos e estáveis',
    (_id, scenario) => {
      const detail = scenario.build();
      const a = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      const b = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(a.alerts).toEqual(b.alerts);
      expect(Array.isArray(a.alerts)).toBe(true);
      for (const alert of a.alerts) {
        expect(alert.id).toBeTruthy();
        expect(alert.kind).toBeTruthy();
        expect(alert.severity).toMatch(/^(info|warning|error)$/);
        expect(alert.metadata.subscriptionId).toBe(a.subscription.id);
        if (alert.eventId) {
          const eventIds = new Set(a.events.map((e) => e.id));
          expect(eventIds.has(alert.eventId)).toBe(true);
        }
      }
    }
  );
});
