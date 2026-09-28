/**
 * Billing Engine V2 — Sprint 3.0D: persiste CustomerInvoiceItems a partir dos drafts V2.
 */
import type { CustomerInvoiceItemDraft } from '../billingEngine/types.js';
import { getCustomerInvoiceSchema } from '../services/customerInvoiceSchema.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { DbQueryable } from './types.js';
import { BillingExecutionOrchestratorError } from './types.js';

export async function persistCustomerInvoiceItemsFromDrafts(
  db: DbQueryable,
  params: {
    invoiceId: string;
    items: CustomerInvoiceItemDraft[];
    scheduledDueDate: string;
  }
): Promise<number> {
  const { invoiceId, items, scheduledDueDate } = params;
  const schema = await getCustomerInvoiceSchema();

  logExecutionOrchestrator('PERSIST_ITEMS', 'start', {
    invoice_id: invoiceId,
    item_count: items.length,
  });

  let inserted = 0;
  for (const it of items) {
    if (schema.hasInvoiceItemAdvancedColumns) {
      await db.query(
        `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
          is_recurring, recurring_interval, scheduled_due_date
        ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          invoiceId,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sequence,
          it.is_recurring,
          it.recurring_interval,
          scheduledDueDate,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
        ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sequence,
        ]
      );
    }
    inserted += 1;
  }

  if (inserted !== items.length) {
    throw new BillingExecutionOrchestratorError(
      'Falha ao persistir todos os itens da fatura',
      'PERSIST_ITEMS_INCOMPLETE',
      'PERSIST_ITEMS'
    );
  }

  logExecutionOrchestrator('PERSIST_ITEMS', 'complete', {
    invoice_id: invoiceId,
    item_count: inserted,
  });

  return inserted;
}
