/**
 * Checkout SaaS USD/EUR via Stripe Checkout Session (mode=subscription).
 * BRL não passa por aqui.
 */
import { pool } from '../../../utils/db.js';
import { isBilling2FlagEnabled } from '../../../services/billing2/billingFeatureFlags.js';
import { createInvoice, getInvoiceById } from '../../../services/invoiceService.js';
import { createStripePlatformClient } from './stripePlatformClient.js';
import { isStripeCatalogEnabled, loadStripePlatformCredentials } from './stripePlatformCredentials.js';
import { assertSaasGatewayCompatible, MixedSaasGatewayError } from './stripePlatformPolicy.js';
import { syncPlanStripePrices } from './stripePlatformPriceSync.js';

export class StripePlatformDisabledError extends Error {
  code = 'STRIPE_PLATFORM_DISABLED';
  constructor() {
    super('Stripe da plataforma está desligada. Mantenha billing2.multi_gateway OFF ou use Asaas em BRL.');
    this.name = 'StripePlatformDisabledError';
  }
}

export class StripePriceMissingError extends Error {
  code = 'STRIPE_PRICE_MISSING';
  constructor() {
    super('Este plano não tem Price Stripe nesta moeda. Publique o preço no Super Admin com a Stripe ligada.');
    this.name = 'StripePriceMissingError';
  }
}

export { MixedSaasGatewayError };

function appBaseUrl(): string {
  const raw = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080').trim();
  return raw.replace(/\/$/, '');
}

async function resolveStripePrice(params: {
  planId: string;
  planType: string;
  currency: 'USD' | 'EUR';
  billingInterval: string;
  usersCount: number | null;
}): Promise<{ stripePriceId: string; amountCents: number; quantity: number }> {
  if (params.planType === 'custom') {
    const r = await pool.query<{ stripe_price_id: string | null; price_per_user_cents: number }>(
      `SELECT stripe_price_id, price_per_user_cents
       FROM plan_interval_prices
       WHERE plan_id = $1 AND billing_interval = $2 AND currency = $3`,
      [params.planId, params.billingInterval, params.currency]
    );
    const row = r.rows[0];
    if (!row?.stripe_price_id) throw new StripePriceMissingError();
    const users = params.usersCount != null && params.usersCount > 0 ? params.usersCount : 1;
    return {
      stripePriceId: row.stripe_price_id,
      amountCents: row.price_per_user_cents * users,
      quantity: users,
    };
  }
  const r = await pool.query<{ stripe_price_id: string | null; price_cents: number }>(
    `SELECT stripe_price_id, price_cents FROM plan_currency_prices WHERE plan_id = $1 AND currency = $2`,
    [params.planId, params.currency]
  );
  const row = r.rows[0];
  if (!row?.stripe_price_id) throw new StripePriceMissingError();
  return { stripePriceId: row.stripe_price_id, amountCents: row.price_cents, quantity: 1 };
}

export async function startStripePlatformCheckout(params: {
  tenantId: string;
  planId: string;
  billingInterval: 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
  usersCount: number | null;
  currency: 'USD' | 'EUR';
}): Promise<{
  billing_id: string;
  invoice_number: string | null;
  amount_cents: number;
  status: string;
  currency: 'USD' | 'EUR';
  checkout_url: string;
}> {
  if (!(await isBilling2FlagEnabled('multi_gateway'))) throw new StripePlatformDisabledError();
  if (!(await isStripeCatalogEnabled())) throw new StripePlatformDisabledError();
  const creds = await loadStripePlatformCredentials();
  if (!creds?.secretKey) throw new StripePlatformDisabledError();

  await assertSaasGatewayCompatible(params.tenantId, 'stripe', params.currency);

  const plan = await pool.query<{ plan_type: string | null; name: string }>(
    `SELECT plan_type, name FROM plans WHERE id = $1 AND is_active = true`,
    [params.planId]
  );
  if (!plan.rows[0]) throw new Error('Plano não encontrado ou inativo');

  await syncPlanStripePrices(params.planId);
  const priced = await resolveStripePrice({
    planId: params.planId,
    planType: plan.rows[0].plan_type ?? 'standard',
    currency: params.currency,
    billingInterval: params.billingInterval,
    usersCount: params.usersCount,
  });

  const tenant = await pool.query<{ name: string; billing_email: string | null }>(
    `SELECT name, billing_email FROM tenants WHERE id = $1`,
    [params.tenantId]
  );
  const email =
    tenant.rows[0]?.billing_email?.trim() ||
    (
      await pool.query<{ email: string }>(
        `SELECT email FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [params.tenantId]
      )
    ).rows[0]?.email ||
    `${params.tenantId}@billing.painelcrm.local`;

  const due = new Date();
  due.setDate(due.getDate() + 7);
  const billing = await createInvoice({
    tenant_id: params.tenantId,
    plan_id: params.planId,
    billing_interval: params.billingInterval,
    amount_cents: priced.amountCents,
    due_date: due,
    source: 'self_service',
    billing_reason: 'plan_purchase',
    payment_method: 'CREDIT_CARD',
    users_count: params.usersCount,
    gateway: 'stripe',
    plan_name_snapshot: plan.rows[0].name,
    plan_price_snapshot: priced.amountCents,
  });

  const { ensureSaasSubscriptionLinkedToOpenBilling } = await import('../../../services/subscriptionService.js');
  const linked = await ensureSaasSubscriptionLinkedToOpenBilling(billing.id);
  if (linked?.subscriptionId) {
    await pool.query(
      `UPDATE subscriptions
       SET currency = $2,
           gateway = 'stripe',
           amount_cents = $3,
           default_payment_method = 'CREDIT_CARD',
           updated_at = now()
       WHERE id = $1::uuid AND type = 'saas'`,
      [linked.subscriptionId, params.currency, priced.amountCents]
    );
  }

  const client = createStripePlatformClient({ secretKey: creds.secretKey });
  const customer = await client.post('/customers', {
    email,
    name: tenant.rows[0]?.name || email,
    'metadata[tenant_id]': params.tenantId,
    'metadata[billing_id]': billing.id,
  });
  const customerId = typeof customer.id === 'string' ? customer.id : '';
  if (!customerId) throw new Error('Stripe não retornou customer id');

  const base = appBaseUrl();
  const session = await client.post('/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': priced.stripePriceId,
    'line_items[0][quantity]': String(priced.quantity),
    success_url: `${base}/checkout?stripe=success&billing_id=${billing.id}`,
    cancel_url: `${base}/checkout?stripe=cancel&billing_id=${billing.id}`,
    'metadata[billing_id]': billing.id,
    'metadata[tenant_id]': params.tenantId,
    'metadata[currency]': params.currency,
    'subscription_data[metadata][billing_id]': billing.id,
    'subscription_data[metadata][tenant_id]': params.tenantId,
    'subscription_data[metadata][currency]': params.currency,
  });
  const url = typeof session.url === 'string' ? session.url : '';
  const sessionId = typeof session.id === 'string' ? session.id : '';
  if (!url) throw new Error('Stripe não retornou URL de checkout');

  await pool.query(
    `UPDATE tenant_billing
     SET gateway = 'stripe',
         gateway_reference_id = $2,
         gateway_metadata = $3::jsonb,
         updated_at = now()
     WHERE id = $1::uuid`,
    [
      billing.id,
      sessionId,
      JSON.stringify({ stripe_customer_id: customerId, currency: params.currency, checkout_session_id: sessionId }),
    ]
  );
  if (linked?.subscriptionId) {
    await pool.query(
      `UPDATE subscriptions SET stripe_customer_id = $2, updated_at = now() WHERE id = $1::uuid`,
      [linked.subscriptionId, customerId]
    );
  }

  const fresh = (await getInvoiceById(billing.id)) ?? billing;
  return {
    billing_id: fresh.id,
    invoice_number: fresh.invoice_number,
    amount_cents: fresh.amount_cents,
    status: fresh.status,
    currency: params.currency,
    checkout_url: url,
  };
}
