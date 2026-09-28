import { describe, it, expect } from 'vitest';
import {
  BILLING_AGGREGATE_PIPELINE_STAGES,
  BILLING_AGGREGATE_PIPELINE_STAGE_NAMES,
  createBillingContext,
  createEmptyBillingAggregate,
  runBillingAggregatePipeline,
  subscriptionStage,
  cycleStage,
  timelineStage,
  financialEventStage,
  historyStage,
  calendarStage,
  sidebarStage,
  nextInvoiceStage,
  alertStage,
  capabilityStage,
  technicalStage,
} from '@/lib/billingAggregate';
import { buildGoldenDetail } from '../golden-dataset';

const STAGES = [
  ['SubscriptionStage', subscriptionStage],
  ['CycleStage', cycleStage],
  ['TimelineStage', timelineStage],
  ['FinancialEventStage', financialEventStage],
  ['HistoryStage', historyStage],
  ['CalendarStage', calendarStage],
  ['NextInvoiceStage', nextInvoiceStage],
  ['SidebarStage', sidebarStage],
  ['AlertStage', alertStage],
  ['CapabilityStage', capabilityStage],
  ['TechnicalStage', technicalStage],
] as const;

describe('BillingAggregate pipeline stages', () => {
  it('registro de stages alinha com nomes canônicos', () => {
    expect(BILLING_AGGREGATE_PIPELINE_STAGES).toHaveLength(STAGES.length);
    expect([...BILLING_AGGREGATE_PIPELINE_STAGE_NAMES]).toEqual(STAGES.map(([name]) => name));
  });

  it.each(STAGES)('%s executa sem erro', (name, stage) => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const initial = createEmptyBillingAggregate(context);
    expect(() => stage(context, initial)).not.toThrow();
  });

  it('SubscriptionStage popula subscription sem cycles', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const initial = createEmptyBillingAggregate(context);
    const result = subscriptionStage(context, initial);
    expect(result.subscription.id).toBe('sub-golden');
    expect(result.subscription.status).toBe('active');
    expect(result.cycles).toHaveLength(0);
  });

  it('pipeline até Capabilities popula em cadeia', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const afterSub = subscriptionStage(context, createEmptyBillingAggregate(context));
    const afterCycles = cycleStage(context, afterSub);
    expect(afterCycles.cycles).toHaveLength(context.source.cycles_raw.length);
    const afterEvents = financialEventStage(context, afterCycles);
    expect(afterEvents.events.length).toBeGreaterThan(0);
    const afterHistory = historyStage(context, afterEvents);
    expect(afterHistory.history).toHaveLength(afterEvents.events.length);
    const afterCalendar = calendarStage(context, afterHistory);
    expect(afterCalendar.calendar.length).toBeGreaterThanOrEqual(afterEvents.events.length);
    const afterNext = nextInvoiceStage(context, afterCalendar);
    expect(afterNext.nextInvoice).not.toBeNull();
    const afterSidebar = sidebarStage(context, afterNext);
    expect(afterSidebar.sidebar.eventCount).toBe(afterEvents.events.length);
    expect(afterSidebar.sidebar.nextReceiptDate).toBeTruthy();
    const afterAlerts = alertStage(context, afterSidebar);
    expect(Array.isArray(afterAlerts.alerts)).toBe(true);
    const afterCaps = capabilityStage(context, afterAlerts);
    expect(afterCaps.capabilities.canOpenSubscription).toBe(true);
  });

  it.each(
    STAGES.filter(
      ([name]) =>
        name !== 'SubscriptionStage' &&
        name !== 'CycleStage' &&
        name !== 'FinancialEventStage' &&
        name !== 'HistoryStage' &&
        name !== 'CalendarStage' &&
        name !== 'SidebarStage' &&
        name !== 'NextInvoiceStage' &&
        name !== 'AlertStage' &&
        name !== 'CapabilityStage'
    )
  )('%s permanece passthrough (placeholder)', (_name, stage) => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const initial = createEmptyBillingAggregate(context);
    const result = stage(context, initial);
    expect(result).toBe(initial);
    expect(result.cycles).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it('runBillingAggregatePipeline aplica stages até Capabilities', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const result = runBillingAggregatePipeline(context, createEmptyBillingAggregate(context));
    expect(result.subscriptionId).toBe('sub-golden');
    expect(result.subscription.status).toBe('active');
    expect(result.cycles).toHaveLength(context.source.cycles_raw.length);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.history).toHaveLength(result.events.length);
    expect(result.calendar.length).toBeGreaterThanOrEqual(result.events.length);
    expect(result.sidebar.eventCount).toBe(result.events.length);
    expect(result.sidebar.subscriptionStatus).toBe('active');
    expect(result.sidebar.nextReceiptDate).not.toBe('—');
    expect(result.nextInvoice).not.toBeNull();
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(result.capabilities.canOpenSubscription).toBe(true);
    expect(result.capabilities.canGenerate).toBe(true);
    expect(result.capabilities.metadata.eventCount).toBe(result.events.length);
  });
});
