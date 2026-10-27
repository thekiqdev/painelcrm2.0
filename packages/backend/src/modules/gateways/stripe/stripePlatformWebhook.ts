/**
 * Webhook Stripe da plataforma. Assinatura verificada antes de qualquer efeito.
 * Flag OFF: não consulta a API Stripe e não altera fatura.
 */
import type { Request, Response } from 'express';
import { pool } from '../../../utils/db.js';
import { isBilling2FlagEnabled } from '../../../services/billing2/billingFeatureFlags.js';
import { updateInvoiceGatewayData, updateInvoiceStatus } from '../../../services/invoiceService.js';
import { loadStripePlatformCredentials } from './stripePlatformCredentials.js';
import { verifyStripeWebhookSignature } from './stripeWebhookSignature.js';

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

function meta(obj: Record<string, unknown> | undefined, key: string): string | null {
  const metadata = obj?.metadata as Record<string, unknown> | undefined;
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM stripe_platform_webhook_events WHERE event_id = $1`, [eventId]);
  return r.rows.length > 0;
}

async function markProcessed(eventId: string, eventType: string): Promise<void> {
  await pool.query(
    `INSERT INTO stripe_platform_webhook_events (event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, eventType]
  );
}

async function markBillingPaid(billingId: string, referenceId: string | null): Promise<void> {
  if (referenceId) {
    await updateInvoiceGatewayData(billingId, {
      gateway: 'stripe',
      payment_method: 'CREDIT_CARD',
      gateway_reference_id: referenceId,
      gateway_status: 'paid',
    });
  }
  await updateInvoiceStatus(billingId, 'paid', new Date(), 'CREDIT_CARD', 'paid');
  const { activatePlanFromBilling } = await import('../../../services/subscriptionService.js');
  await activatePlanFromBilling(billingId);
}

async function attachStripeSubscription(billingId: string, subscriptionId: string, customerId: string | null): Promise<void> {
  const sub = await pool.query<{ subscription_id: string | null }>(
    `SELECT subscription_id FROM tenant_billing WHERE id = $1::uuid`,
    [billingId]
  );
  const localId = sub.rows[0]?.subscription_id;
  if (!localId) return;
  await pool.query(
    `UPDATE subscriptions
     SET stripe_subscription_id = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         gateway = 'stripe',
         updated_at = now()
     WHERE id = $1::uuid AND type = 'saas'`,
    [localId, subscriptionId, customerId]
  );
}

async function applyEvent(event: StripeEvent): Promise<void> {
  const type = event.type || '';
  const obj = event.data?.object ?? {};
  const billingId = meta(obj, 'billing_id');

  if (type === 'checkout.session.completed' && billingId) {
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null;
    const customerId = typeof obj.customer === 'string' ? obj.customer : null;
    const sessionId = typeof obj.id === 'string' ? obj.id : null;
    if (subscriptionId) await attachStripeSubscription(billingId, subscriptionId, customerId);
    if (obj.payment_status === 'paid') {
      await markBillingPaid(billingId, sessionId);
    }
    return;
  }

  if (type === 'invoice.paid' && billingId) {
    const invoiceId = typeof obj.id === 'string' ? obj.id : null;
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null;
    if (subscriptionId) await attachStripeSubscription(billingId, subscriptionId, null);
    await markBillingPaid(billingId, invoiceId);
    return;
  }

  if (type === 'invoice.payment_failed' && billingId) {
    const local = await pool.query<{ subscription_id: string | null }>(
      `SELECT subscription_id FROM tenant_billing WHERE id = $1::uuid`,
      [billingId]
    );
    if (local.rows[0]?.subscription_id) {
      await pool.query(
        `UPDATE subscriptions SET status = 'past_due', updated_at = now()
         WHERE id = $1::uuid AND type = 'saas' AND status = 'active'`,
        [local.rows[0].subscription_id]
      );
    }
    return;
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subscriptionId = typeof obj.id === 'string' ? obj.id : null;
    if (!subscriptionId) return;
    const stripeStatus = typeof obj.status === 'string' ? obj.status : '';
    const localStatus =
      type === 'customer.subscription.deleted' || stripeStatus === 'canceled'
        ? 'cancelled'
        : stripeStatus === 'past_due' || stripeStatus === 'unpaid'
          ? 'past_due'
          : stripeStatus === 'active' || stripeStatus === 'trialing'
            ? 'active'
            : null;
    if (!localStatus) return;
    await pool.query(
      `UPDATE subscriptions
       SET status = $2, updated_at = now()
       WHERE stripe_subscription_id = $1 AND type = 'saas'`,
      [subscriptionId, localStatus]
    );
  }
}

export async function stripePlatformWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isBilling2FlagEnabled('multi_gateway'))) {
      res.status(503).json({ error: 'Stripe plataforma desligada' });
      return;
    }
    const creds = await loadStripePlatformCredentials();
    if (!creds?.webhookSecret) {
      res.status(400).json({ error: 'Webhook secret ausente' });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : '';
    const header = req.get('stripe-signature') || undefined;
    const ok = verifyStripeWebhookSignature({
      payload: raw,
      header,
      secret: creds.webhookSecret,
    });
    if (!ok) {
      res.status(400).json({ error: 'Assinatura inválida' });
      return;
    }
    const event = JSON.parse(raw) as StripeEvent;
    const eventId = event.id?.trim();
    if (!eventId || !event.type) {
      res.status(400).json({ error: 'Evento inválido' });
      return;
    }
    if (await alreadyProcessed(eventId)) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    await applyEvent(event);
    await markProcessed(eventId, event.type);
    res.status(200).json({ received: true });
  } catch (e) {
    console.error('[stripe platform webhook]', e);
    res.status(500).json({ error: 'Falha ao processar webhook Stripe' });
  }
}
