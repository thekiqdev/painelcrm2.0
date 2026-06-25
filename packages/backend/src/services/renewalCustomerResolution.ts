/**
 * Resolução automática de customer_id em assinaturas CRM (B0.1).
 */
import type { SubscriptionRow } from './billingSubscriptionService.js';
import { billingLog } from './billingLogger.js';

type DbQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export type CustomerResolutionVia =
  | 'subscription_field'
  | 'invoice_client_id'
  | 'invoice_history_unique'
  | 'client_exists_check';

export type CustomerResolutionResult =
  | { ok: true; customer_id: string; resolved_via: CustomerResolutionVia; persisted: boolean }
  | { ok: false; reason: 'no_customer_found'; permanent: true };

async function findUniqueClientIdFromInvoices(
  db: DbQueryable,
  subscriptionId: string
): Promise<string | null> {
  const r = await db.query(
    `SELECT client_id::text, COUNT(*)::text AS cnt
     FROM customer_invoices
     WHERE subscription_id = $1::uuid
       AND client_id IS NOT NULL
     GROUP BY client_id
     ORDER BY COUNT(*) DESC, MAX(created_at) DESC
     LIMIT 2`,
    [subscriptionId]
  );
  const rows = r.rows as { client_id: string; cnt: string }[];
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!.client_id;
  const first = parseInt(rows[0]!.cnt, 10);
  const second = parseInt(rows[1]!.cnt, 10);
  if (first > second) return rows[0]!.client_id;
  return null;
}

async function clientExists(db: DbQueryable, tenantId: string, clientId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT EXISTS(
       SELECT 1 FROM clients WHERE id = $1::uuid AND tenant_id = $2::uuid
     ) AS ok`,
    [clientId, tenantId]
  );
  return !!(r.rows[0] as { ok?: boolean } | undefined)?.ok;
}

type SubscriptionCustomerRef = Pick<SubscriptionRow, 'id' | 'tenant_id' | 'customer_id'>;

/**
 * Resolve customer_id e persiste em subscriptions quando reconstruível com segurança.
 */
export async function resolveAndPersistSubscriptionCustomerId(
  db: DbQueryable,
  subscription: SubscriptionCustomerRef
): Promise<CustomerResolutionResult> {
  const existing = subscription.customer_id?.trim();
  if (existing) {
    const exists = await clientExists(db, subscription.tenant_id, existing);
    if (exists) {
      return { ok: true, customer_id: existing, resolved_via: 'subscription_field', persisted: false };
    }
    billingLog('job', 'customer_resolution_stale_customer_id', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      customer_id: existing,
    });
  }

  const fromInvoices = await findUniqueClientIdFromInvoices(db, subscription.id);
  if (fromInvoices && (await clientExists(db, subscription.tenant_id, fromInvoices))) {
    await db.query(
      `UPDATE subscriptions SET customer_id = $1::uuid, updated_at = now()
       WHERE id = $2::uuid AND tenant_id = $3::uuid AND (customer_id IS NULL OR customer_id <> $1::uuid)`,
      [fromInvoices, subscription.id, subscription.tenant_id]
    );
    billingLog('job', 'customer_resolution_persisted', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      customer_id: fromInvoices,
      resolved_via: 'invoice_client_id',
    });
    return { ok: true, customer_id: fromInvoices, resolved_via: 'invoice_client_id', persisted: true };
  }

  return { ok: false, reason: 'no_customer_found', permanent: true };
}

/** Dry-run (sem persistir) — scheduler / diagnóstico. */
export async function probeSubscriptionCustomerId(
  db: DbQueryable,
  subscription: Pick<SubscriptionRow, 'id' | 'tenant_id' | 'customer_id'>
): Promise<CustomerResolutionResult> {
  const existing = subscription.customer_id?.trim();
  if (existing && (await clientExists(db, subscription.tenant_id, existing))) {
    return { ok: true, customer_id: existing, resolved_via: 'subscription_field', persisted: false };
  }
  const fromInvoices = await findUniqueClientIdFromInvoices(db, subscription.id);
  if (fromInvoices && (await clientExists(db, subscription.tenant_id, fromInvoices))) {
    return { ok: true, customer_id: fromInvoices, resolved_via: 'invoice_history_unique', persisted: false };
  }
  return { ok: false, reason: 'no_customer_found', permanent: true };
}
