/**
 * Credencial global da Stripe da plataforma.
 * Não desativa o gateway Asaas ativo. A linha stripe fica fora do resolver SaaS (is_active false).
 * Fallback: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (secret de ambiente, nunca no bundle).
 */
import { pool } from '../../../utils/db.js';

export type StripePlatformCredentials = {
  secretKey: string;
  webhookSecret: string;
  env: 'sandbox' | 'production';
  source: 'database' | 'env';
};

const MASK = '••••••••';

export function maskSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length <= 4) return MASK;
  return `${MASK}${s.slice(-4)}`;
}

export async function loadStripePlatformCredentials(): Promise<StripePlatformCredentials | null> {
  const r = await pool.query<{ credentials: Record<string, unknown> | null; options: Record<string, unknown> | null }>(
    `SELECT credentials, options
     FROM payment_gateway_configs
     WHERE scope = 'global' AND gateway_key = 'stripe'
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const row = r.rows[0];
  const creds = row?.credentials ?? {};
  const dbSecret = typeof creds.secret_key === 'string' ? creds.secret_key.trim() : '';
  const dbWebhook = typeof creds.webhook_secret === 'string' ? creds.webhook_secret.trim() : '';
  const dbEnv = row?.options?.env === 'production' || creds.env === 'production' ? 'production' : 'sandbox';

  if (dbSecret) {
    return {
      secretKey: dbSecret,
      webhookSecret: dbWebhook,
      env: dbEnv,
      source: 'database',
    };
  }

  const envSecret = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!envSecret) return null;
  const envMode = (process.env.STRIPE_MODE || '').trim().toLowerCase();
  return {
    secretKey: envSecret,
    webhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
    env: envMode === 'live' || envMode === 'production' ? 'production' : 'sandbox',
    source: 'env',
  };
}

export async function upsertStripePlatformCredentials(input: {
  secretKey?: string | null;
  webhookSecret?: string | null;
  env: 'sandbox' | 'production';
}): Promise<{ secretMasked: string | null; webhookMasked: string | null; env: 'sandbox' | 'production' }> {
  const existing = await pool.query<{ id: string; credentials: Record<string, unknown> | null }>(
    `SELECT id, credentials
     FROM payment_gateway_configs
     WHERE scope = 'global' AND gateway_key = 'stripe'
     LIMIT 1`
  );
  const prev = (existing.rows[0]?.credentials ?? {}) as Record<string, unknown>;
  const nextSecret =
    input.secretKey && input.secretKey.trim() && input.secretKey !== MASK
      ? input.secretKey.trim()
      : typeof prev.secret_key === 'string'
        ? prev.secret_key
        : '';
  const nextWebhook =
    input.webhookSecret && input.webhookSecret.trim() && input.webhookSecret !== MASK
      ? input.webhookSecret.trim()
      : typeof prev.webhook_secret === 'string'
        ? prev.webhook_secret
        : '';
  const credentials = {
    secret_key: nextSecret,
    webhook_secret: nextWebhook,
    env: input.env,
  };
  const options = { env: input.env };

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET credentials = $2::jsonb,
           options = $3::jsonb,
           display_name = 'Stripe plataforma',
           is_active = false,
           updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, JSON.stringify(credentials), JSON.stringify(options)]
    );
  } else {
    await pool.query(
      `INSERT INTO payment_gateway_configs (
         scope, tenant_id, gateway_key, is_active, display_name, credentials, options, status
       ) VALUES ('global', NULL, 'stripe', false, 'Stripe plataforma', $1::jsonb, $2::jsonb, 'pending')`,
      [JSON.stringify(credentials), JSON.stringify(options)]
    );
  }

  return {
    secretMasked: maskSecret(nextSecret),
    webhookMasked: maskSecret(nextWebhook),
    env: input.env,
  };
}

export async function isStripeCatalogEnabled(): Promise<boolean> {
  const r = await pool.query<{ is_enabled: boolean }>(
    `SELECT is_enabled FROM payment_gateways WHERE key = 'stripe' LIMIT 1`
  );
  return r.rows[0]?.is_enabled === true;
}
