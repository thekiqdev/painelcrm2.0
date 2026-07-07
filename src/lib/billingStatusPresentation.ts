/**
 * Sprint 5.0-23C — camada única de apresentação de status financeiros (PT-BR).
 * Nunca exibir enums internos (pending, queued, failed, …) na UI.
 */
import type { FinancialBadgeVariant } from './financialStatusBadge';
import type { FinancialEventType } from './financialEventTypes';
import type { BillingFinancialEventType } from './billingAggregate/types';
import type { OperationalCompetencyResolution } from './operationalCompetencyResolverCore';

const CYCLE_STATUS_PT: Record<string, string> = {
  pending: 'Pendente',
  queued: 'Pendente',
  processing: 'Processando',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  skipped: 'Ignorada',
  invoiced: 'Pendente',
  generated: 'Emitida',
  paid: 'Pago',
  refunded: 'Reembolsada',
  chargeback: 'Reembolsada',
  overdue: 'Atrasada',
  waiting_payment: 'Pendente',
  gateway_failed: 'Falhou',
};

const EVENT_TYPE_PT: Partial<Record<FinancialEventType | BillingFinancialEventType, string>> = {
  payment: 'Pago',
  invoice_generated: 'Emitida',
  invoice_due: 'Pendente',
  invoice_failed: 'Falhou',
  invoice_cancelled: 'Cancelada',
  invoice_refunded: 'Reembolsada',
  invoice_reprocessed: 'Reprocessada',
  upcoming_cycle: 'Prevista',
  manual_charge: 'Emitida',
  charge_attempt: 'Tentativa',
  cycle_pending: 'Pendente',
  cycle_queued: 'Pendente',
  cycle_processing: 'Processando',
  cycle_skipped: 'Ignorada',
  cycle_cancelled: 'Cancelada',
  cycle_unknown: 'Pendente',
};

const RESOLUTION_PT: Partial<Record<OperationalCompetencyResolution, string>> = {
  READY_TO_GENERATE: 'Pendente',
  READY_TO_OPEN: 'Pendente',
  READY_TO_REPROCESS: 'Falhou',
  PROJECTION_ONLY: 'Prevista',
  WAITING_MATERIALIZATION: 'Pendente',
  NO_COMPETENCY: 'Prevista',
  SUBSCRIPTION_CANCELLED: 'Cancelada',
};

function normalizeToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function billingCycleStatusLabel(status: string | null | undefined): string {
  const key = normalizeToken(status);
  if (!key) return 'Pendente';
  return CYCLE_STATUS_PT[key] ?? 'Pendente';
}

export function billingEventTypeLabel(
  eventType: FinancialEventType | BillingFinancialEventType | null | undefined,
  overdue = false
): string {
  if (!eventType) return 'Pendente';
  if (eventType === 'invoice_due' && overdue) return 'Atrasada';
  return EVENT_TYPE_PT[eventType] ?? 'Pendente';
}

export function billingResolutionLabel(
  resolution: OperationalCompetencyResolution | null | undefined
): string | null {
  if (!resolution) return null;
  return RESOLUTION_PT[resolution] ?? null;
}

export type BillingStatusPresentationInput = {
  cycleStatus?: string | null;
  invoiceStatus?: string | null;
  eventType?: FinancialEventType | BillingFinancialEventType | null;
  resolution?: OperationalCompetencyResolution | null;
  overdue?: boolean;
  isProjected?: boolean;
  fallback?: string | null;
};

/** Rótulo canônico em português para qualquer superfície financeira. */
export function billingStatusLabel(input: BillingStatusPresentationInput): string {
  if (input.isProjected) return 'Prevista';
  const resolutionLabel = billingResolutionLabel(input.resolution);
  if (resolutionLabel && input.resolution !== 'READY_TO_OPEN') {
    if (input.resolution === 'READY_TO_GENERATE' || input.resolution === 'READY_TO_REPROCESS') {
      return resolutionLabel;
    }
  }
  const inv = normalizeToken(input.invoiceStatus);
  if (inv === 'paid') return 'Pago';
  if (inv === 'cancelled') return 'Cancelada';
  if (inv === 'refunded' || inv === 'chargeback') return 'Reembolsada';
  if (inv === 'overdue') return 'Atrasada';
  if (inv === 'pending' || inv === 'waiting_payment') return 'Pendente';
  if (input.eventType) {
    const fromEvent = billingEventTypeLabel(input.eventType, input.overdue);
    if (fromEvent !== 'Pendente' || !input.cycleStatus) return fromEvent;
  }
  const cycle = billingCycleStatusLabel(input.cycleStatus);
  if (cycle !== 'Pendente') return cycle;
  if (input.fallback && !/^[a-z_]+$/.test(input.fallback.trim())) return input.fallback;
  return cycle;
}

export function billingStatusBadge(input: BillingStatusPresentationInput): FinancialBadgeVariant {
  const label = billingStatusLabel(input);
  if (label === 'Pago') return 'paid';
  if (label === 'Atrasada' || label === 'Falhou') return label === 'Falhou' ? 'failed' : 'overdue';
  if (label === 'Cancelada' || label === 'Reembolsada') return 'cancelled';
  if (label === 'Prevista') return 'pending';
  return 'pending';
}

/** @deprecated use billingStatusLabel */
export const BillingStatusPresentation = {
  label: billingStatusLabel,
  badge: billingStatusBadge,
  cycle: billingCycleStatusLabel,
  event: billingEventTypeLabel,
};
