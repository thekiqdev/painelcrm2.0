/**
 * Colunas opcionais de customer_invoices (migração 81). Permite rodar o backend sem migração aplicada.
 */
import { pool } from '../utils/db.js';

export interface CustomerInvoiceSchemaInfo {
  /** true se migração 81 aplicou parent_invoice_id + parent_invoice_item_id */
  hasParentInvoiceColumns: boolean;
  /** true se migração 80 aplicou is_recurring, recurring_interval, scheduled_due_date em customer_invoice_items */
  hasInvoiceItemAdvancedColumns: boolean;
  /** true se migração 235 aplicou project_id em customer_invoices */
  hasProjectIdColumn: boolean;
  /** SELECT ... FROM customer_invoices ci — lista com prefixo ci. */
  selectListFromCi: string;
  /** SELECT ... FROM customer_invoices (sem prefixo). */
  selectListBare: string;
  /** RETURNING após INSERT (só nomes de colunas existentes na tabela) */
  insertReturning: string;
}

let cached: Promise<CustomerInvoiceSchemaInfo> | null = null;

function buildSelectListFromCi(hasParent: boolean, hasProjectId: boolean): string {
  const mid = hasParent
    ? 'ci.parent_invoice_id, ci.parent_invoice_item_id,'
    : 'NULL::uuid AS parent_invoice_id, NULL::uuid AS parent_invoice_item_id,';
  const project = hasProjectId ? 'ci.project_id,' : 'NULL::uuid AS project_id,';
  return `ci.id, ci.tenant_id, ci.client_id, ci.subscription_id, ${mid} ci.period_start, ci.period_end, ci.amount_cents, ci.due_date,
   ci.status, ci.paid_at, ci.invoice_number, ci.gateway, ci.payment_method,
   ci.gateway_reference_id, ci.gateway_metadata, ci.gateway_status, ci.idempotency_key,
   ci.origin, ci.invoice_type, ci.description, ci.payment_token, ci.charge_id, ${project} ci.created_at, ci.updated_at`;
}

function buildSelectListBare(hasParent: boolean, hasProjectId: boolean): string {
  const mid = hasParent
    ? 'parent_invoice_id, parent_invoice_item_id,'
    : 'NULL::uuid AS parent_invoice_id, NULL::uuid AS parent_invoice_item_id,';
  const project = hasProjectId ? 'project_id,' : 'NULL::uuid AS project_id,';
  return `id, tenant_id, client_id, subscription_id, ${mid} period_start, period_end, amount_cents, due_date,
   status, paid_at, invoice_number, gateway, payment_method,
   gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
   origin, invoice_type, description, payment_token, charge_id, ${project} created_at, updated_at`;
}

function buildInsertReturning(hasParent: boolean, hasProjectId: boolean): string {
  const project = hasProjectId ? 'project_id,' : 'NULL::uuid AS project_id,';
  if (hasParent) {
    return `id, tenant_id, client_id, subscription_id, parent_invoice_id, parent_invoice_item_id, period_start, period_end, amount_cents, due_date,
   status, paid_at, invoice_number, gateway, payment_method,
   gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
   origin, invoice_type, description, payment_token, charge_id, ${project} created_at, updated_at`;
  }
  return `id, tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
   status, paid_at, invoice_number, gateway, payment_method,
   gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
   origin, invoice_type, description, payment_token, charge_id, ${project} created_at, updated_at`;
}

export async function getCustomerInvoiceSchema(): Promise<CustomerInvoiceSchemaInfo> {
  if (!cached) {
    cached = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'customer_invoices'
         AND column_name IN ('parent_invoice_id', 'parent_invoice_item_id')`
      );
      const n = parseInt(r.rows[0]?.c ?? '0', 10);
      const hasParent = n === 2;

      const rItems = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'customer_invoice_items'
         AND column_name IN ('is_recurring', 'recurring_interval', 'scheduled_due_date')`
      );
      const nItems = parseInt(rItems.rows[0]?.c ?? '0', 10);
      const hasItemAdvanced = nItems === 3;

      const rProject = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'customer_invoices'
         AND column_name = 'project_id'`
      );
      const hasProjectId = parseInt(rProject.rows[0]?.c ?? '0', 10) === 1;

      return {
        hasParentInvoiceColumns: hasParent,
        hasInvoiceItemAdvancedColumns: hasItemAdvanced,
        hasProjectIdColumn: hasProjectId,
        selectListFromCi: buildSelectListFromCi(hasParent, hasProjectId),
        selectListBare: buildSelectListBare(hasParent, hasProjectId),
        insertReturning: buildInsertReturning(hasParent, hasProjectId),
      };
    })();
  }
  return cached;
}
