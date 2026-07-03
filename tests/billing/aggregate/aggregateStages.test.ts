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
  ['SidebarStage', sidebarStage],
  ['NextInvoiceStage', nextInvoiceStage],
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

  it('CycleStage → FinancialEvent → History → Calendar populam em cadeia', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const afterSub = subscriptionStage(context, createEmptyBillingAggregate(context));
    const afterCycles = cycleStage(context, afterSub);
    expect(afterCycles.cycles).toHaveLength(context.source.cycles_raw.length);
    const afterEvents = financialEventStage(context, afterCycles);
    expect(afterEvents.events).toHaveLength(afterCycles.cycles.length);
    const afterHistory = historyStage(context, afterEvents);
    expect(afterHistory.history).toHaveLength(afterEvents.events.length);
    const afterCalendar = calendarStage(context, afterHistory);
    expect(afterCalendar.calendar).toHaveLength(afterEvents.events.length);
  });

  it.each(
    STAGES.filter(
      ([name]) =>
        name !== 'SubscriptionStage' &&
        name !== 'CycleStage' &&
        name !== 'FinancialEventStage' &&
        name !== 'HistoryStage' &&
        name !== 'CalendarStage'
    )
  )('%s permanece passthrough (placeholder)', (_name, stage) => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const initial = createEmptyBillingAggregate(context);
    const result = stage(context, initial);
    expect(result).toBe(initial);
    expect(result.cycles).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it('runBillingAggregatePipeline aplica stages até Calendar', () => {
    const context = createBillingContext(buildGoldenDetail(), '2026-06-30');
    const result = runBillingAggregatePipeline(context, createEmptyBillingAggregate(context));
    expect(result.subscriptionId).toBe('sub-golden');
    expect(result.subscription.status).toBe('active');
    expect(result.cycles).toHaveLength(context.source.cycles_raw.length);
    expect(result.events).toHaveLength(result.cycles.length);
    expect(result.history).toHaveLength(result.events.length);
    expect(result.calendar).toHaveLength(result.events.length);
    expect(result.alerts).toEqual([]);
  });
});
