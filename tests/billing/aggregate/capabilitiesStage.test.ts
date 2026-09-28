import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  buildBillingAggregateFromDetail,
  buildCapabilitiesFromAggregate,
  createBillingContext,
  createEmptyBillingAggregate,
  cycleStage,
  financialEventStage,
  calendarStage,
  historyStage,
  nextInvoiceStage,
  alertStage,
  capabilityStage,
  sidebarStage,
  subscriptionStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail, timelineRow } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const FORBIDDEN_LEGACY_IMPORTS = [
  'FinancialEventStore',
  'subscriptionFinancialEventStore',
  'resolveInvoiceCapabilities',
  'cycleSupportsManualGenerate',
  'subscriptionFinancialExperience',
  'billingSubscriptionExperience',
  'subscriptionFinancialProjection',
  'billingStateMachine',
  'subscriptionTimelineUx',
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CAPABILITIES_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/capabilitiesSnapshot.ts'
);
const BUILDER_MODULE = path.resolve(
  MODULE_DIR,
  '../../../src/lib/billingAggregate/BillingAggregateBuilder.ts'
);

const REQUIRED_CAPABILITY_FIELDS = [
  'canGenerate',
  'canRetry',
  'canCancel',
  'canRefund',
  'canPause',
  'canResume',
  'canReactivate',
  'canDeleteInvoice',
  'canOpenInvoice',
  'canOpenSubscription',
  'metadata',
] as const;

function readModuleSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('CapabilitiesStage', () => {
  it('módulo capabilitiesSnapshot não importa motor legado', () => {
    const source = readModuleSource(CAPABILITIES_MODULE);
    for (const forbidden of FORBIDDEN_LEGACY_IMPORTS) {
      expect(source).not.toMatch(new RegExp(`from ['"].*${forbidden}`));
    }
    expect(source).not.toMatch(/detail\.timeline/);
    expect(source).not.toMatch(/cycles_raw/);
    expect(source).not.toMatch(/context\.source/);
  });

  it('CapabilitiesStage no builder usa o Aggregate completo', () => {
    const builder = readModuleSource(BUILDER_MODULE);
    const stageBlock = builder.slice(
      builder.indexOf('export const capabilityStage'),
      builder.indexOf('export const technicalStage')
    );
    expect(stageBlock).toContain('buildCapabilitiesFromAggregate');
    expect(stageBlock).toContain('aggregate.subscription');
    expect(stageBlock).toContain('aggregate.cycles');
    expect(stageBlock).toContain('aggregate.events');
    expect(stageBlock).toContain('aggregate.history');
    expect(stageBlock).toContain('aggregate.calendar');
    expect(stageBlock).toContain('aggregate.sidebar');
    expect(stageBlock).toContain('aggregate.nextInvoice');
    expect(stageBlock).toContain('aggregate.alerts');
    expect(stageBlock).not.toContain('context.source');
  });

  it.each(REQUIRED_CAPABILITY_FIELDS)('campo obrigatório presente: %s', (field) => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.capabilities).toHaveProperty(field);
  });

  it('assinatura active com ciclo pending: canGenerate e canPause', () => {
    const aggregate = buildBillingAggregateFromDetail(buildGoldenDetail(), '2026-06-30');
    expect(aggregate.capabilities.canGenerate).toBe(true);
    expect(aggregate.capabilities.canPause).toBe(true);
    expect(aggregate.capabilities.canResume).toBe(false);
    expect(aggregate.capabilities.canOpenSubscription).toBe(true);
  });

  it('assinatura paused: canResume true, canPause false', () => {
    const aggregate = buildBillingAggregateFromDetail(
      buildGoldenDetail({ subscription: { status: 'paused' }, timeline: [], cycles_raw: [] }),
      '2026-06-30'
    );
    expect(aggregate.capabilities.canResume).toBe(true);
    expect(aggregate.capabilities.canPause).toBe(false);
    expect(aggregate.capabilities.canGenerate).toBe(false);
  });

  it('evento failed definitivo: canRetry true', () => {
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
    expect(aggregate.capabilities.canRetry).toBe(true);
    expect(aggregate.capabilities.metadata.failedEventCount).toBe(1);
  });

  it('pagamento: canRefund true', () => {
    const detail = buildGoldenDetail({
      cycles_raw: [
        {
          id: 'c-paid',
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
    expect(aggregate.capabilities.canRefund).toBe(true);
    expect(aggregate.capabilities.canOpenInvoice).toBe(true);
    expect(aggregate.capabilities.canDeleteInvoice).toBe(true);
  });

  it('mesmo Aggregate produz sempre as mesmas Capabilities', () => {
    const detail = buildGoldenDetail({
      timeline: [timelineRow({ cycle_id: 'c-a', due_date: '2026-07-14' })],
    });
    const a = buildBillingAggregateFromDetail(detail, '2026-06-30');
    const b = buildBillingAggregateFromDetail(detail, '2026-06-30');
    expect(a.capabilities).toEqual(b.capabilities);
  });

  it('capabilityStage isolada usa apenas o Aggregate', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    let aggregate = createEmptyBillingAggregate(context);
    aggregate = subscriptionStage(context, aggregate);
    aggregate = cycleStage(context, aggregate);
    aggregate = financialEventStage(context, aggregate);
    aggregate = historyStage(context, aggregate);
    aggregate = calendarStage(context, aggregate);
    aggregate = nextInvoiceStage(context, aggregate);
    aggregate = sidebarStage(context, aggregate);
    aggregate = alertStage(context, aggregate);
    const result = capabilityStage(context, aggregate);
    expect(result.capabilities).toEqual(
      buildCapabilitiesFromAggregate({
        subscription: aggregate.subscription,
        cycles: aggregate.cycles,
        events: aggregate.events,
        history: aggregate.history,
        calendar: aggregate.calendar,
        sidebar: aggregate.sidebar,
        nextInvoice: aggregate.nextInvoice,
        alerts: aggregate.alerts,
      })
    );
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — capabilities presentes e estáveis',
    (_id, scenario) => {
      const detail = scenario.build();
      const a = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      const b = buildBillingAggregateFromDetail(detail, scenario.todayYmd);
      expect(a.capabilities).toEqual(b.capabilities);
      expect(a.capabilities.canOpenSubscription).toBe(true);
      expect(a.capabilities.metadata.subscriptionId).toBe(a.subscription.id);
      expect(a.capabilities.metadata.eventCount).toBe(a.events.length);
      expect(a.capabilities.metadata.cycleCount).toBe(a.cycles.length);
      expect(a.capabilities.metadata.historyCount).toBe(a.history.length);
      expect(a.capabilities.metadata.calendarCount).toBe(a.calendar.length);
      expect(a.capabilities.metadata.alertCount).toBe(a.alerts.length);
      expect(a.capabilities.metadata.hasNextInvoice).toBe(a.nextInvoice !== null);
    }
  );
});
