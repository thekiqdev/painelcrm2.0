/**
 * Webhook Stripe do tenant. A secret é a do tenant na URL, nunca a da plataforma.
 */
import type { Request, Response } from 'express';
import { pool } from '../../../utils/db.js';
import { updateCustomerInvoiceStatus } from '../../../services/customerInvoiceService.js';
import { isStripeTenantEnabled } from './stripeTenantFlags.js';
import { loadStripeTenantCredentials } from './stripeTenantCredentials.js';
import { verifyStripeWebhookSignature } from './stripeWebhookSignature.js';

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

export async function stripeTenantWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isStripeTenantEnabled())) {
      res.status(503).json({ error: 'Stripe do tenant desligada' });
      return;
    }
    const tenantId = String(req.params.tenantId || '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenant ausente' });
      return;
    }
    const creds = await loadStripeTenantCredentials(tenantId);
    if (!creds?.webhookSecret) {
      res.status(400).json({ error: 'Webhook secret do tenant ausente' });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const ok = verifyStripeWebhookSignature({
      payload: raw,
      header: req.get('stripe-signature') || undefined,
      secret: creds.webhookSecret,
    });
    if (!ok) {
      res.status(400).json({ error: 'Assinatura inválida' });
      return;
    }
    const event = JSON.parse(raw) as StripeEvent;
    const obj = event.data?.object ?? {};
    if (event.type === 'checkout.session.completed' && obj.mode === 'payment' && obj.payment_status === 'paid') {
      const sessionId = typeof obj.id === 'string' ? obj.id : '';
      if (sessionId) {
        const invoice = await pool.query<{ id: string }>(
          `SELECT id::text AS id
           FROM customer_invoices
           WHERE tenant_id = $1::uuid
             AND gateway = 'stripe'
             AND gateway_reference_id = $2
           LIMIT 1`,
          [tenantId, sessionId]
        );
        const invoiceId = invoice.rows[0]?.id;
        if (invoiceId) {
          await updateCustomerInvoiceStatus(invoiceId, 'paid', new Date(), 'paid');
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error('[stripe tenant webhook]', e);
    res.status(500).json({ error: 'Falha ao processar webhook Stripe do tenant' });
  }
}
