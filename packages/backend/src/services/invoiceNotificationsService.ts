import { pool } from '../utils/db.js';
import { createNotification, type NotificationType } from './notifications.js';
import {
  publishInvoiceCreatedNotification,
  publishInvoiceDueSoonDigest,
  publishInvoiceOverdueDigest,
  publishInvoicePaidNotification,
} from './notificationsEngine/businessTransactionalNotifications.js';
import { scheduleBillingNotificationSideEffect } from './notificationsEngine/billingNotificationFlush.js';

export type InvoiceNotificationEvent =
  | 'invoice_created'
  | 'invoice_due_soon'
  | 'invoice_overdue'
  | 'invoice_paid'
  | 'payment_failed';

type InvoiceNotificationContext = {
  tenantId: string;
  invoiceNumber: string;
  amountCents: number;
  dueDate: string;
  clientName: string | null;
};

function moneyPtBr(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function tenantSystemNotificationRecipients(tenantId: string): Promise<string[]> {
  const adminR = await pool.query<{ id: string }>(
    `SELECT u.id::text AS id
     FROM users u
     INNER JOIN user_profiles up ON up.owner_id = u.id
     WHERE u.tenant_id = $1::uuid
       AND COALESCE(up.is_admin, false) = true
     ORDER BY u.created_at ASC
     LIMIT 25`,
    [tenantId]
  );
  if (adminR.rows.length > 0) return [...new Set(adminR.rows.map((r) => r.id))];

  const anyR = await pool.query<{ id: string }>(
    `SELECT id::text AS id
     FROM users
     WHERE tenant_id = $1::uuid
     ORDER BY created_at ASC
     LIMIT 10`,
    [tenantId]
  );
  return [...new Set(anyR.rows.map((r) => r.id))];
}

async function loadInvoiceNotificationContext(invoiceId: string): Promise<InvoiceNotificationContext | null> {
  const r = await pool.query<{
    tenant_id: string;
    invoice_number: string | null;
    amount_cents: number;
    due_date: string;
    client_name: string | null;
  }>(
    `SELECT ci.tenant_id::text,
            ci.invoice_number,
            ci.amount_cents,
            ci.due_date::text,
            c.name AS client_name
     FROM customer_invoices ci
     LEFT JOIN clients c ON c.id = ci.client_id
     WHERE ci.id = $1::uuid
     LIMIT 1`,
    [invoiceId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    invoiceNumber: row.invoice_number?.trim() || invoiceId.slice(0, 8),
    amountCents: Number(row.amount_cents),
    dueDate: row.due_date,
    clientName: row.client_name,
  };
}

async function hasRecentInAppInvoiceNotification(
  invoiceId: string,
  type: InvoiceNotificationEvent,
  idempotencyDay?: string
): Promise<boolean> {
  const dayClause = idempotencyDay ? `AND data->>'idempotency_day' = $3` : '';
  const params = idempotencyDay ? [invoiceId, type, idempotencyDay] : [invoiceId, type];
  const r = await pool.query<{ id: string }>(
    `SELECT id::text
     FROM notifications
     WHERE data->>'invoice_id' = $1
       AND type = $2
       ${dayClause}
     LIMIT 1`,
    params
  );
  return r.rows.length > 0;
}

async function notifyInvoiceInApp(
  invoiceId: string,
  event: InvoiceNotificationEvent,
  options: { idempotencyDay?: string } = {}
): Promise<void> {
  if (await hasRecentInAppInvoiceNotification(invoiceId, event, options.idempotencyDay)) return;

  const ctx = await loadInvoiceNotificationContext(invoiceId);
  if (event === 'invoice_paid') {
    console.log('[NOTIFY][INVOICE_PAID]', { invoiceId, step: 'context', found: Boolean(ctx) });
  }
  if (!ctx) return;
  const recipients = await tenantSystemNotificationRecipients(ctx.tenantId);
  console.log('[NOTIFY][INVOICE]', {
    event,
    invoiceId,
    tenantId: ctx.tenantId,
    recipients: recipients.length,
  });
  if (recipients.length === 0) return;

  const titleByEvent: Record<InvoiceNotificationEvent, string> = {
    invoice_created: 'Fatura criada',
    invoice_due_soon: 'Fatura próxima do vencimento',
    invoice_overdue: 'Fatura vencida',
    invoice_paid: 'Fatura paga',
    payment_failed: 'Falha no pagamento',
  };
  const messageByEvent: Record<InvoiceNotificationEvent, string> = {
    invoice_created: `${ctx.invoiceNumber} criada${ctx.clientName ? ` para ${ctx.clientName}` : ''} (${moneyPtBr(ctx.amountCents)}).`,
    invoice_due_soon: `${ctx.invoiceNumber} vence em ${ctx.dueDate}${ctx.clientName ? ` — ${ctx.clientName}` : ''}.`,
    invoice_overdue: `${ctx.invoiceNumber} venceu em ${ctx.dueDate}${ctx.clientName ? ` — ${ctx.clientName}` : ''}.`,
    invoice_paid: `${ctx.invoiceNumber} foi paga${ctx.clientName ? ` por ${ctx.clientName}` : ''} (${moneyPtBr(ctx.amountCents)}).`,
    payment_failed: `Pagamento da fatura ${ctx.invoiceNumber} falhou${ctx.clientName ? ` — ${ctx.clientName}` : ''}.`,
  };

  for (const userId of recipients) {
    try {
      await createNotification({
        userId,
        type: event as NotificationType,
        title: titleByEvent[event],
        message: messageByEvent[event],
        category: 'system',
        data: {
          invoice_id: invoiceId,
          customer_invoice_id: invoiceId,
          invoice_number: ctx.invoiceNumber,
          client_name: ctx.clientName,
          amount_cents: ctx.amountCents,
          due_date: ctx.dueDate,
          ...(options.idempotencyDay ? { idempotency_day: options.idempotencyDay } : {}),
          href: `/customer-invoices/${invoiceId}`,
        },
      });
    } catch (e) {
      console.warn('[invoiceNotifications] in-app failed', event, userId, e);
    }
  }
}

export function notifyInvoiceCreated(params: {
  tenantId: string;
  invoiceId: string;
  preferredSenderUserId?: string | null;
}): void {
  publishInvoiceCreatedNotification({
    pool,
    tenantId: params.tenantId,
    invoiceId: params.invoiceId,
    preferredSenderUserId: params.preferredSenderUserId ?? null,
  });
  scheduleBillingNotificationSideEffect('invoice_in_app.created', () =>
    notifyInvoiceInApp(params.invoiceId, 'invoice_created'),
  );
}

export function notifyInvoicePaid(params: {
  tenantId: string;
  invoiceId: string;
  preferredSenderUserId?: string | null;
}): void {
  publishInvoicePaidNotification({
    pool,
    tenantId: params.tenantId,
    invoiceId: params.invoiceId,
    preferredSenderUserId: params.preferredSenderUserId ?? null,
  });
  void notifyInvoiceInApp(params.invoiceId, 'invoice_paid').catch((err) =>
    console.error('[invoiceNotifications] notifyInvoicePaid:', err)
  );
}

export function notifyInvoiceOverdue(params: {
  tenantId?: string | null;
  invoiceId: string;
  idempotencyDay?: string;
  preferredSenderUserId?: string | null;
  publishOutboundDigest?: boolean;
}): void {
  const day = params.idempotencyDay ?? todayKey();
  if (params.publishOutboundDigest && params.tenantId) {
    publishInvoiceOverdueDigest({
      pool,
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      idempotencyDay: day,
      preferredSenderUserId: params.preferredSenderUserId ?? null,
    });
  }
  void notifyInvoiceInApp(params.invoiceId, 'invoice_overdue', { idempotencyDay: day }).catch((err) =>
    console.error('[invoiceNotifications] notifyInvoiceOverdue:', err)
  );
}

export function notifyInvoiceDueSoon(params: {
  tenantId: string;
  invoiceId: string;
  idempotencyDay?: string;
  preferredSenderUserId?: string | null;
  publishOutboundDigest?: boolean;
}): void {
  const day = params.idempotencyDay ?? todayKey();
  if (params.publishOutboundDigest !== false) {
    publishInvoiceDueSoonDigest({
      pool,
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      idempotencyDay: day,
      preferredSenderUserId: params.preferredSenderUserId ?? null,
    });
  }
  void notifyInvoiceInApp(params.invoiceId, 'invoice_due_soon', { idempotencyDay: day }).catch((err) =>
    console.error('[invoiceNotifications] notifyInvoiceDueSoon:', err)
  );
}

export function notifyInvoicePaymentFailed(invoiceId: string): void {
  void notifyInvoiceInApp(invoiceId, 'payment_failed').catch((err) =>
    console.error('[invoiceNotifications] notifyInvoicePaymentFailed:', err)
  );
}
