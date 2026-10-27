/**
 * Cria Product/Price na Stripe ao publicar USD/EUR.
 * Flag OFF: retorna sem HTTP.
 */
import { pool } from '../../../utils/db.js';
import { isBilling2FlagEnabled } from '../../../services/billing2/billingFeatureFlags.js';
import { billingIntervalToStripeRecurring } from './stripeRecurring.js';
import { createStripePlatformClient } from './stripePlatformClient.js';
import { isStripeCatalogEnabled, loadStripePlatformCredentials } from './stripePlatformCredentials.js';

export type StripePriceSyncResult =
  | { skipped: true; reason: 'flag_off' | 'catalog_off' | 'no_credentials' }
  | { skipped: false; updated: number };

async function ensureProduct(
  client: ReturnType<typeof createStripePlatformClient>,
  planId: string,
  name: string,
  existingProductId: string | null
): Promise<string> {
  if (existingProductId) return existingProductId;
  const product = await client.post('/products', {
    name,
    'metadata[plan_id]': planId,
  });
  const id = typeof product.id === 'string' ? product.id : '';
  if (!id) throw new Error('Stripe não retornou product id');
  await pool.query(`UPDATE plans SET stripe_product_id = $2, updated_at = now() WHERE id = $1`, [planId, id]);
  return id;
}

async function createRecurringPrice(
  client: ReturnType<typeof createStripePlatformClient>,
  params: {
    productId: string;
    currency: string;
    unitAmount: number;
    interval: string;
    planId: string;
  }
): Promise<string> {
  const recurring = billingIntervalToStripeRecurring(params.interval);
  const price = await client.post('/prices', {
    product: params.productId,
    currency: params.currency.toLowerCase(),
    unit_amount: String(Math.max(0, Math.trunc(params.unitAmount))),
    'recurring[interval]': recurring.interval,
    'recurring[interval_count]': String(recurring.interval_count),
    'metadata[plan_id]': params.planId,
    'metadata[billing_interval]': params.interval,
    'metadata[currency]': params.currency,
  });
  const id = typeof price.id === 'string' ? price.id : '';
  if (!id) throw new Error('Stripe não retornou price id');
  return id;
}

export async function syncPlanStripePrices(planId: string): Promise<StripePriceSyncResult> {
  if (!(await isBilling2FlagEnabled('multi_gateway'))) return { skipped: true, reason: 'flag_off' };
  if (!(await isStripeCatalogEnabled())) return { skipped: true, reason: 'catalog_off' };
  const creds = await loadStripePlatformCredentials();
  if (!creds?.secretKey) return { skipped: true, reason: 'no_credentials' };

  const client = createStripePlatformClient({ secretKey: creds.secretKey });
  const plan = await pool.query<{ name: string; stripe_product_id: string | null; billing_interval: string; plan_type: string }>(
    `SELECT name, stripe_product_id, billing_interval, plan_type FROM plans WHERE id = $1`,
    [planId]
  );
  const row = plan.rows[0];
  if (!row) return { skipped: false, updated: 0 };

  const productId = await ensureProduct(client, planId, row.name, row.stripe_product_id);
  let updated = 0;

  const currencyPrices = await pool.query<{ currency: string; price_cents: number; stripe_price_id: string | null }>(
    `SELECT currency, price_cents, stripe_price_id FROM plan_currency_prices WHERE plan_id = $1`,
    [planId]
  );
  for (const cp of currencyPrices.rows) {
    if (cp.currency === 'BRL') continue;
    if (cp.stripe_price_id) continue;
    const priceId = await createRecurringPrice(client, {
      productId,
      currency: cp.currency,
      unitAmount: cp.price_cents,
      interval: row.billing_interval || 'monthly',
      planId,
    });
    await pool.query(
      `UPDATE plan_currency_prices
       SET stripe_price_id = $3, stripe_product_id = $4, updated_at = now()
       WHERE plan_id = $1 AND currency = $2`,
      [planId, cp.currency, priceId, productId]
    );
    updated += 1;
  }

  const intervals = await pool.query<{
    billing_interval: string;
    currency: string;
    price_per_user_cents: number;
    stripe_price_id: string | null;
  }>(
    `SELECT billing_interval, currency, price_per_user_cents, stripe_price_id
     FROM plan_interval_prices WHERE plan_id = $1 AND currency IN ('USD', 'EUR')`,
    [planId]
  );
  for (const ip of intervals.rows) {
    if (ip.stripe_price_id) continue;
    const priceId = await createRecurringPrice(client, {
      productId,
      currency: ip.currency,
      unitAmount: ip.price_per_user_cents,
      interval: ip.billing_interval,
      planId,
    });
    await pool.query(
      `UPDATE plan_interval_prices
       SET stripe_price_id = $4
       WHERE plan_id = $1 AND billing_interval = $2 AND currency = $3`,
      [planId, ip.billing_interval, ip.currency, priceId]
    );
    updated += 1;
  }

  return { skipped: false, updated };
}
