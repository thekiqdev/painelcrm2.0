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
      expect(source).not.toMatch(new RegExp(`from ['"].*${forbidden}`));
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('AlertsStage usa subscription, events, cycles, invoices e nextInvoice', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const alertStage'),
      builder.indexOf('export const capabilityStage')
    );
    expect(stageBlock).toContain('buildAlertsFromAggregate');
    expect(stageBlock).toContain('aggregate.subscription');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).toContain('aggregate.cycles');
    expect(stageBlock).toContain('aggregate.invoices');
    expect(stageBlock).not.toContain('context.source');
  });

  it.each(REQUIRED_ALERT_FIELDS)('campo obrigatório presente: %s', (field) => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-overdue',
          cycle_date: '2026-06-01',
          period_start: '2026-05-25',
          period_end: '2026-06-25',
          status: 'generated',
          invoice_id: 'inv-overdue',
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.alerts.length).toBeGreaterThan(0);
    expect(aggregate.alerts[0]).toHaveProperty(field);
  });

  it('sem ciclos problemáticos não emite alertas legados', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.alerts.every((a) =>
      ['billing_missing', 'client_overdue', 'gateway_failed'].includes(a.kind)
    )).toBe(true);
    expect(aggregate.alerts).toHaveLength(0);
  });

  it('emite client_overdue para fatura vencida', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-overdue',
          cycle_date: '2026-06-01',
          period_start: '2026-05-25',
          period_end: '2026-06-25',
          status: 'generated',
          invoice_id: 'inv-overdue',
          job_id: null,
          processed_at: null,
          skipped_reason: null,
          error_message: null,
        },
      ],
    });
    const aggregate = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(aggregate.alerts.some((a) => a.kind === 'client_overdue')).toBe(true);
  });

  it('emite billing_missing para falha definitiva no passado', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-fail',
          cycle_date: '2026-05-14',
          period_start: '2026-05-07',
          period_end: '2026-06-07',
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
    expect(aggregate.alerts.some((a) => a.kind === 'billing_missing')).toBe(true);
  });

  it('assinatura pausada sem ciclos não emite alertas legados', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ subscription: { status: 'paused' }, timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.alerts).toHaveLength(0);
  });

  it('mesmo Aggregate gera sempre os mesmos Alerts', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' })],
    });
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(a.alerts).toEqual(b.alerts);
  });

  it('alertStage isolada usa subscription, events, cycles e nextInvoice', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    aggregate = nextInvoiceStage(context, aggregate);
    aggregate = sidebarStage(context, aggregate);
    const result = alertStage(context, aggregate);
    expect(result.alerts).toEqual(
      buildAlertsFromAggregate(
        aggregate.subscription,
        aggregate.events,
        aggregate.nextInvoice,
        aggregate.cycles,
        aggregate.invoices,
        context.todayYmd
      )
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
