import type { FinancialEventType } from './financialEventTypes';
import { INVOICE_ACTIONABLE } from './customerInvoiceActions';

/** Quando true, PDF entra automaticamente nas ações disponíveis. */
export const INVOICE_PDF_FEATURE_ENABLED = false;

export type InvoiceCapabilitiesInput = {
  invoiceId?: string | null;
  paymentToken?: string | null;
  canViewInvoices?: boolean;
  /** Status CRM da fatura, quando conhecido. */
  invoiceStatus?: string | null;
  /** Contexto do evento financeiro (calendário / histórico). */
  eventType?: FinancialEventType | null;
  gateway?: string | null;
};

export type InvoiceCapabilities = {
  supportsPdf: boolean;
  supportsPublicUrl: boolean;
  supportsEmail: boolean;
  supportsPix: boolean;
  supportsGateway: boolean;
  supportsOpen: boolean;
  supportsRegisterPayment: boolean;
  supportsGenerate: boolean;
  supportsChangeDue: boolean;
  supportsViewHistory: boolean;
  supportsResolve: boolean;
  supportsReprocess: boolean;
};

function isPendingEventType(type: FinancialEventType | null | undefined): boolean {
  if (!type) return false;
  return (
    type === 'invoice_due' ||
    type === 'invoice_generated' ||
    type === 'manual_charge' ||
    type === 'charge_attempt'
  );
}

function isPaidEventType(type: FinancialEventType | null | undefined): boolean {
  return type === 'payment';
}

function isForecastEventType(type: FinancialEventType | null | undefined): boolean {
  return type === 'upcoming_cycle';
}

function isFailedEventType(type: FinancialEventType | null | undefined): boolean {
  return type === 'invoice_failed' || type === 'charge_attempt';
}

export function resolveInvoiceCapabilities(input: InvoiceCapabilitiesInput): InvoiceCapabilities {
  const hasInvoice = Boolean(input.invoiceId?.trim());
  const canView = input.canViewInvoices !== false;
  const status = (input.invoiceStatus ?? '').toLowerCase();
  const actionable = hasInvoice && (status ? INVOICE_ACTIONABLE.has(status) : isPendingEventType(input.eventType));
  const paid = hasInvoice && (status === 'paid' || isPaidEventType(input.eventType));
  const forecast = !hasInvoice && isForecastEventType(input.eventType);
  const failed = isFailedEventType(input.eventType);
  const gateway = Boolean(input.gateway?.trim());

  return {
    supportsPdf: INVOICE_PDF_FEATURE_ENABLED && hasInvoice && canView,
    supportsPublicUrl: hasInvoice && canView,
    supportsEmail: hasInvoice && canView,
    supportsPix: false,
    supportsGateway: gateway && hasInvoice,
    supportsOpen: hasInvoice && canView,
    supportsRegisterPayment: hasInvoice && canView && actionable && !paid,
    supportsGenerate: forecast || (failed && !hasInvoice),
    supportsChangeDue: forecast,
    supportsViewHistory: canView,
    supportsResolve: failed,
    supportsReprocess: failed && hasInvoice,
  };
}
