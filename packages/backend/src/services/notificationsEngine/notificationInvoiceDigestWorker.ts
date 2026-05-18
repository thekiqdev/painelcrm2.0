/**
 * Digest opt-in para invoice.due_soon / invoice.overdue (Fase 4).
 * Requer NOTIFICATIONS_ENGINE_INVOICE_DIGEST_ENABLED=true e restantes flags do motor.
 */
import { pool, withBillingWorkerRlsBypass } from '../../utils/db.js';
import {
  isNotificationsEngineEnabled,
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineInvoiceDigestEnabled,
  getNotificationsEngineDueSoonLookaheadDays,
  isBusinessNotificationEventKeyAllowed,
} from '../../config/notificationsEngineEnv.js';
import { notifyInvoiceDueSoon, notifyInvoiceOverdue } from '../invoiceNotificationsService.js';
import { neLogError } from './notificationEngineLog.js';

export async function processInvoiceNotificationDigestBatch(
  maxPerKind: number,
): Promise<{ due_soon: number; overdue: number }> {
  if (
    !isNotificationsEngineEnabled() ||
    !isNotificationsEngineBusinessEventsEnabled() ||
    !isNotificationsEngineInvoiceDigestEnabled()
  ) {
    return { due_soon: 0, overdue: 0 };
  }

  const day = new Date().toISOString().slice(0, 10);
  const lookahead = getNotificationsEngineDueSoonLookaheadDays();

  return withBillingWorkerRlsBypass(async () => {
    let dueSoon = 0;
    let overdue = 0;

    if (isBusinessNotificationEventKeyAllowed('invoice.due_soon')) {
      const rs = await pool.query<{ id: string; tenant_id: string }>(
        `SELECT ci.id::text AS id, ci.tenant_id::text AS tenant_id
         FROM customer_invoices ci
         WHERE ci.client_id IS NOT NULL
           AND ci.status IN ('pending', 'waiting_payment', 'processing')
           AND ci.due_date::date > CURRENT_DATE
           AND ci.due_date::date <= CURRENT_DATE + ($1::int || ' days')::interval
         ORDER BY ci.due_date ASC
         LIMIT $2`,
        [lookahead, maxPerKind],
      );
      for (const row of rs.rows) {
        notifyInvoiceDueSoon({
          tenantId: row.tenant_id,
          invoiceId: row.id,
          idempotencyDay: day,
          preferredSenderUserId: null,
          publishOutboundDigest: true,
        });
        dueSoon += 1;
      }
    }

    if (isBusinessNotificationEventKeyAllowed('invoice.overdue')) {
      const ro = await pool.query<{ id: string; tenant_id: string }>(
        `SELECT ci.id::text AS id, ci.tenant_id::text AS tenant_id
         FROM customer_invoices ci
         WHERE ci.client_id IS NOT NULL
           AND ci.status IN ('pending', 'waiting_payment', 'processing', 'overdue')
           AND ci.due_date::date < CURRENT_DATE
         ORDER BY ci.due_date ASC
         LIMIT $1`,
        [maxPerKind],
      );
      for (const row of ro.rows) {
        notifyInvoiceOverdue({
          tenantId: row.tenant_id,
          invoiceId: row.id,
          idempotencyDay: day,
          preferredSenderUserId: null,
          publishOutboundDigest: true,
        });
        overdue += 1;
      }
    }

    return { due_soon: dueSoon, overdue };
  });
}

export async function runInvoiceDigestTickSafe(): Promise<void> {
  try {
    await processInvoiceNotificationDigestBatch(80);
  } catch (e) {
    neLogError('invoice_digest_tick', {}, e);
  }
}
