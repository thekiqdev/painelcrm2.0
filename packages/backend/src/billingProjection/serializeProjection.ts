/**
 * Billing Engine V2 — Sprint 2.3D: serialização segura de ProjectedInvoice para API.
 */
import type { ProjectedInvoice } from './types.js';

export function serializeProjectedInvoice(invoice: ProjectedInvoice): Record<string, unknown> {
  return {
    invoice: invoice.invoice,
    invoiceItems: invoice.invoiceItems,
    subtotal: invoice.subtotal,
    discounts: invoice.discounts,
    taxes: invoice.taxes,
    fees: invoice.fees,
    grandTotal: invoice.grandTotal,
    currency: invoice.currency,
    period: invoice.period,
    dueDate: invoice.dueDate,
    gateway: invoice.gateway,
    notifications: invoice.notifications,
    timeline: invoice.timeline,
    history: invoice.history,
    metadata: invoice.metadata,
    diagnostics: invoice.diagnostics,
  };
}
