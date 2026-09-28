/**
 * Billing Engine V2 — Sprint 2.3D: hash SHA-256 determinístico da projeção.
 */
import { createHash } from 'node:crypto';
import type { ProjectedInvoice, ProjectedInvoiceItem } from './types.js';

function stableItem(item: ProjectedInvoiceItem): Record<string, unknown> {
  return {
    sequence: item.sequence,
    definitionHash: item.definitionHash,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    tax: item.tax,
    subtotal: item.subtotal,
    total: item.total,
    currency: item.currency,
    billingRule: item.billingRule,
    effectiveRevision: item.effectiveRevision,
  };
}

function stableGateway(gateway: ProjectedInvoice['gateway']): Record<string, unknown> | null {
  if (!gateway) return null;
  return {
    payment_method: gateway.payment_method,
    currency: gateway.currency,
    amount: gateway.amount,
    payload: gateway.payload,
  };
}

export function computeProjectionHash(invoice: ProjectedInvoice): string {
  const payload = {
    items: invoice.invoiceItems.map(stableItem),
    subtotal: invoice.subtotal,
    discounts: invoice.discounts,
    taxes: invoice.taxes,
    fees: invoice.fees,
    grandTotal: invoice.grandTotal,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    period: {
      cycleKey: invoice.period.cycleKey,
      periodStart: invoice.period.periodStart,
      periodEnd: invoice.period.periodEnd,
      dueDate: invoice.period.dueDate,
      interval: invoice.period.interval,
      frequency: invoice.period.frequency,
    },
    gateway: stableGateway(invoice.gateway),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
