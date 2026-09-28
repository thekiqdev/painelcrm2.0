import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { BillingInvoiceSnapshot } from './types';

export type BillingInvoiceRawSource = NonNullable<CrmSubscriptionDetailPayload['invoices']>[number];

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Resolve ciclo vinculado à fatura via `cycles_raw.invoice_id`. */
export function resolveInvoiceCycleId(
  invoiceId: string,
  cycles: CrmSubscriptionDetailPayload['cycles_raw']
): string | null {
  const match = cycles.find((c) => c.invoice_id === invoiceId);
  return match?.id ?? null;
}

/**
 * Mapeia item de `invoices[]` → `BillingInvoiceSnapshot` (1:1).
 * Sprint 5.0-21D — ingress invoice-aware (4.2R §6.1).
 */
export function mapInvoiceSnapshot(
  invoice: BillingInvoiceRawSource,
  cycles: CrmSubscriptionDetailPayload['cycles_raw']
): BillingInvoiceSnapshot {
  const explicitCycleId = optionalString(invoice.subscription_cycle_id);
  return {
    id: invoice.id,
    subscription_cycle_id:
      explicitCycleId ?? resolveInvoiceCycleId(invoice.id, cycles),
    status: invoice.status,
    amount_cents: invoice.amount_cents,
    due_date: invoice.due_date,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    created_at: invoice.created_at,
    gateway_status: invoice.gateway_status,
    gateway_reference_id: invoice.gateway_reference_id,
    invoice_type: invoice.invoice_type ?? null,
    paid_at: invoice.paid_at ?? null,
    refunded_at: invoice.refunded_at ?? null,
  };
}

/** Copia todas as faturas preservando a ordem de `invoices[]`. */
export function mapInvoicesFromSource(
  invoices: BillingInvoiceRawSource[] | undefined,
  cycles: CrmSubscriptionDetailPayload['cycles_raw']
): BillingInvoiceSnapshot[] {
  if (!invoices?.length) return [];
  return invoices.map((inv) => mapInvoiceSnapshot(inv, cycles));
}
