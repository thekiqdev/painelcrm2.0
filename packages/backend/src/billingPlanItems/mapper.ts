/**
 * Billing Engine V2 — converte invoice lines → BillingPlanItemCreateInput (sem persistir).
 */
import type { CustomerInvoiceItemRow } from '../services/customerInvoiceService.js';
import type {
  BillingPlanItemCreateInput,
  BillingPlanItemInvoiceLineSource,
  BillingPlanItemInvoiceSource,
} from './types.js';

export function mapInvoiceItemToBillingItemInput(params: {
  tenantId: string;
  billingPlanId: string;
  invoice: BillingPlanItemInvoiceSource;
  line: BillingPlanItemInvoiceLineSource | CustomerInvoiceItemRow;
  sequence?: number;
  currency?: string;
}): BillingPlanItemCreateInput {
  const line = params.line;
  const sortOrder = 'sort_order' in line ? line.sort_order : 1;
  const sequence = params.sequence ?? sortOrder;
  const currency = (params.currency ?? params.invoice.currency?.trim()) || 'BRL';
  const discountCents = line.discount_cents ?? 0;

  return {
    tenant_id: params.tenantId,
    billing_plan_id: params.billingPlanId,
    sequence,
    status: 'draft',
    item_type: line.product_id ? 'product' : 'service',
    origin: 'subscription',
    name: line.description?.trim() || `Item ${sequence}`,
    description: line.description,
    quantity: Number(line.quantity) || 0,
    unit_price: Math.max(0, line.unit_price_cents),
    discount_type: discountCents > 0 ? 'fixed' : 'none',
    discount_value: Math.max(0, discountCents),
    tax_rate: null,
    tax_value: 0,
    total_amount: Math.max(0, line.total_cents),
    currency,
    is_recurring: Boolean(line.is_recurring),
    billing_interval: line.recurring_interval ?? null,
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: 'none',
    starts_at: params.invoice.period_start?.slice(0, 10) ?? null,
    ends_at: params.invoice.period_end?.slice(0, 10) ?? null,
    trial_until: null,
    metadata: {
      source: 'invoice_item_mapper',
      source_invoice_id: params.invoice.id,
      source_invoice_item_id: line.id,
      scheduled_due_date: line.scheduled_due_date ?? null,
    },
  };
}

export function mapInvoiceItemsToBillingItems(params: {
  tenantId: string;
  billingPlanId: string;
  invoice: BillingPlanItemInvoiceSource;
  lines: Array<BillingPlanItemInvoiceLineSource | CustomerInvoiceItemRow>;
  currency?: string;
}): BillingPlanItemCreateInput[] {
  return params.lines.map((line, idx) =>
    mapInvoiceItemToBillingItemInput({
      tenantId: params.tenantId,
      billingPlanId: params.billingPlanId,
      invoice: params.invoice,
      line,
      sequence: 'sort_order' in line ? line.sort_order : idx + 1,
      currency: params.currency,
    })
  );
}
