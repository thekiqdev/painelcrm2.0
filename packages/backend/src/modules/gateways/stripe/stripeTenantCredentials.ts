/**
 * Credencial Stripe do tenant. Nunca lê a secret global da plataforma nem STRIPE_SECRET_KEY.
 */
import { pool } from '../../../utils/db.js';
import { maskSecret } from './stripePlatformCredentials.js';

export type StripeTenantCredentials = {
  secretKey: string;
  webhookSecret: string;
  env: 'sandbox' | 'production';
};

export async function loadStripeTenantCredentials(tenantId: string): Promise<StripeTenantCredentials | null> {
  const r = await pool.query<{ credentials: Record<string, unknown> | null; options: Record<string, unknown> | null }>(
    `SELECT credentials, options
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = 'stripe'
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const creds = row.credentials ?? {};
  const secret = typeof creds.secret_key === 'string' ? creds.secret_key.trim() : '';
  if (!secret) return null;
  const env = row.options?.env === 'production' || creds.env === 'production' ? 'production' : 'sandbox';
  return {
    secretKey: secret,
    webhookSecret: typeof creds.webhook_secret === 'string' ? creds.webhook_secret.trim() : '',
    env,
  };
}

export async function upsertStripeTenantCredentials(
  tenantId: string,
  input: { secretKey?: string | null; webhookSecret?: string | null; env: 'sandbox' | 'production' }
): Promise<{ secretMasked: string | null; webhookMasked: string | null; env: 'sandbox' | 'production' }> {
  const existing = await pool.query<{ id: string; credentials: Record<string, unknown> | null }>(
    `SELECT id, credentials
     FROM payment_gateway_configs
     WHERE scope = 'tenant' AND tenant_id = $1::uuid AND gateway_key = 'stripe'
     LIMIT 1`,
    [tenantId]
  );
  const prev = (existing.rows[0]?.credentials ?? {}) as Record<string, unknown>;
  const nextSecret =
    input.secretKey && input.secretKey.trim() && !input.secretKey.includes('••••')
      ? input.secretKey.trim()
      : typeof prev.secret_key === 'string'
        ? prev.secret_key
        : '';
  const nextWebhook =
    input.webhookSecret && input.webhookSecret.trim() && !input.webhookSecret.includes('••••')
      ? input.webhookSecret.trim()
      : typeof prev.webhook_secret === 'string'
        ? prev.webhook_secret
        : '';
  const credentials = { secret_key: nextSecret, webhook_secret: nextWebhook, env: input.env };
  const options = { env: input.env, stripe_scope: 'tenant' };

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET credentials = $2::jsonb,
           options = $3::jsonb,
           display_name = 'Stripe',
           is_active = true,
           status = 'active',
           enabled_payment_methods = '["credit_card"]'::jsonb,
           default_payment_method = 'credit_card',
           updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, JSON.stringify(credentials), JSON.stringify(options)]
    );
  } else {
    await pool.query(
      `INSERT INTO payment_gateway_configs (
         scope, tenant_id, gateway_key, is_active, display_name, credentials, options, status,
         enabled_payment_methods, default_payment_method
       ) VALUES (
         'tenant', $1::uuid, 'stripe', true, 'Stripe', $2::jsonb, $3::jsonb, 'active',
         '["credit_card"]'::jsonb, 'credit_card'
       )`,
      [tenantId, JSON.stringify(credentials), JSON.stringify(options)]
    );
  }

  return {
    secretMasked: maskSecret(nextSecret),
    webhookMasked: maskSecret(nextWebhook),
    env: input.env,
  };
}

export function stripeTenantPublicView(creds: StripeTenantCredentials | null): {
  configured: boolean;
  env: 'sandbox' | 'production';
  secret_key_masked: string | null;
  webhook_secret_masked: string | null;
} {
  return {
    configured: Boolean(creds?.secretKey),
    env: creds?.env ?? 'sandbox',
    secret_key_masked: maskSecret(creds?.secretKey),
    webhook_secret_masked: maskSecret(creds?.webhookSecret),
  };
}
