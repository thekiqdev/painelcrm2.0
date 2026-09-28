/**
 * Billing Engine V2 — Sprint 3.0D: persiste CustomerInvoice a partir do draft V2.
 */
import crypto from 'node:crypto';
import type { CustomerInvoiceDraft } from '../billingEngine/types.js';
import { getCustomerInvoiceSchema } from '../services/customerInvoiceSchema.js';
import type { CustomerInvoiceRow } from '../services/customerInvoiceService.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { DbQueryable } from './types.js';

function generateInvoiceNumber(tenantId: string): string {
  const short = tenantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `CINV-${short}-${suffix}`;
}

export async function persistCustomerInvoiceFromDraft(
  db: DbQueryable,
  draft: CustomerInvoiceDraft
): Promise<CustomerInvoiceRow> {
  const schema = await getCustomerInvoiceSchema();
  const invoiceNumber = generateInvoiceNumber(draft.tenant_id);
  const paymentToken = crypto.randomUUID();

  logExecutionOrchestrator('PERSIST_INVOICE', 'start', {
    subscription_id: draft.subscription_id,
    tenant_id: draft.tenant_id,
    cycle_key: draft.cycle_key,
    amount_cents: draft.amount_cents,
  });

  const r = await db.query(
    `INSERT INTO customer_invoices (
      tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
      status, invoice_number, gateway, origin, invoice_type, payment_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, 'subscription', 'recurring', $10)
    RETURNING ${schema.insertReturning}`,
    [
      draft.tenant_id,
      draft.client_id,
      draft.subscription_id,
      draft.period_start,
      draft.period_end,
      draft.amount_cents,
      draft.due_date,
      invoiceNumber,
      draft.gateway ?? null,
      paymentToken,
    ]
  );

  const row = r.rows[0] as CustomerInvoiceRow;

  logExecutionOrchestrator('PERSIST_INVOICE', 'complete', {
    subscription_id: draft.subscription_id,
    invoice_id: row.id,
    invoice_number: row.invoice_number ?? undefined,
  });

  return row;
}

export async function rollbackPersistedInvoice(
  db: DbQueryable,
  invoiceId: string,
  tenantId: string
): Promise<void> {
  await db.query(`DELETE FROM customer_invoice_items WHERE invoice_id = $1::uuid`, [invoiceId]);
  await db.query(`DELETE FROM customer_invoices WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
    invoiceId,
    tenantId,
  ]);
}
