import type { BillingAggregate } from '@/lib/billingAggregate';
import type { TechnicalDiagnostics } from '@/lib/billingSubscriptionExperience';

/** Technical diagnostics a partir do Aggregate (sem timeline / cycles_raw). */
export function buildTechnicalDiagnosticsFromAggregate(
  aggregate: BillingAggregate
): TechnicalDiagnostics {
  const failedEvent = aggregate.events.find(
    (e) => e.kind === 'real' && e.eventType === 'invoice_failed'
  );
  const latestJobId = aggregate.events
    .map((e) => e.metadata.jobId)
    .filter(Boolean)
    .sort()
    .pop();

  return {
    workerStatus: aggregate.technical.workerStatus ?? aggregate.subscription.metadata.lastJobAt,
    retryAt: null,
    cycleKey: failedEvent?.cycleId ?? aggregate.nextInvoice?.cycleId ?? null,
    jobId: failedEvent?.metadata.jobId ?? latestJobId ?? null,
    engineVersion: aggregate.technical.engineVersion ?? '3.0',
    executionTime: aggregate.builtAt,
    stacktrace: failedEvent?.metadata.errorMessage ?? null,
    workerVersion: null,
    executionVersion: null,
    runtimeVersion: null,
    pipeline: 'billing-aggregate',
    currentStage: 'ui-wiring',
    requestId: null,
    retryCount: null,
    workerAttempt: null,
    caller: null,
    billingPlanId: aggregate.subscription.metadata.planId,
    billingPlanItemCount: null,
    currentCycleYmd: aggregate.nextInvoice?.date ?? null,
    nextCycleYmd: null,
    currentInvoiceId: aggregate.nextInvoice?.metadata.invoiceId ?? null,
    normalizedDates: undefined,
    lastGenerationAt: null,
  };
}

export type TechnicalAccordionView = {
  diagnostics: TechnicalDiagnostics;
  cycleCount: number;
  eventCount: number;
  cyclesReadEnabled: boolean;
};

export function buildTechnicalAccordionViewFromAggregate(
  aggregate: BillingAggregate
): TechnicalAccordionView {
  return {
    diagnostics: buildTechnicalDiagnosticsFromAggregate(aggregate),
    cycleCount: aggregate.cycles.length,
    eventCount: aggregate.events.filter((e) => e.kind === 'real').length,
    cyclesReadEnabled: aggregate.cycles.length > 0,
  };
}
