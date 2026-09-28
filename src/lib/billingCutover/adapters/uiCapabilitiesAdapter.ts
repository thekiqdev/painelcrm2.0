import type { BillingAggregate } from '@/lib/billingAggregate';
import { invoiceVisibilityFromCycle } from '@/lib/resolvedCompetencyPresentation';

/** Capabilities UI derivadas do BillingAggregate — visibilidade Gerar por invoice_id. */
export type BillingUiCapabilities = {
  canGenerate: boolean;
  canRetry: boolean;
  canRefund: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canOpenInvoice: boolean;
  generateCycleIds: string[];
  retryCycleIds: string[];
  refundCycleIds: string[];
};

export function buildUiCapabilitiesFromAggregate(
  aggregate: BillingAggregate
): BillingUiCapabilities {
  const { subscription, cycles, events, capabilities, invoices } = aggregate;
  const status = subscription.status;

  const generateCycleIds =
    status === 'cancelled'
      ? []
      : cycles
          .filter((c) => invoiceVisibilityFromCycle(c.invoiceId, status).canGenerate)
          .map((c) => c.id);

  const canGenerateGlobal =
    status !== 'cancelled' &&
    cycles.some((c) => invoiceVisibilityFromCycle(c.invoiceId, status).canGenerate);

  const retryCycleIds = events
    .filter((e) => e.kind === 'real' && e.eventType === 'invoice_failed' && e.cycleId)
    .map((e) => e.cycleId!)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const refundCycleIds = events
    .filter((e) => e.kind === 'real' && e.eventType === 'payment' && e.cycleId)
    .map((e) => e.cycleId!)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const paidInvoiceIds = new Set(
    invoices.filter((i) => i.status.trim().toLowerCase() === 'paid').map((i) => i.id)
  );

  return {
    canGenerate: canGenerateGlobal,
    canRetry: capabilities.canRetry,
    canRefund: capabilities.canRefund || paidInvoiceIds.size > 0,
    canPause: capabilities.canPause,
    canResume: capabilities.canResume,
    canCancel: capabilities.canCancel,
    canOpenInvoice: capabilities.canOpenInvoice,
    generateCycleIds,
    retryCycleIds: status === 'cancelled' ? [] : retryCycleIds,
    refundCycleIds,
  };
}

export function cycleCanGenerateFromUiCapabilities(
  caps: BillingUiCapabilities,
  cycleId: string | null | undefined
): boolean {
  if (!cycleId?.trim()) return false;
  return caps.generateCycleIds.includes(cycleId.trim());
}
