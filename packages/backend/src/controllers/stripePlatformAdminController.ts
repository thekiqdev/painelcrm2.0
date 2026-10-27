/**
 * Credencial Stripe da plataforma no Super Admin. Nunca devolve a secret completa.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  loadStripePlatformCredentials,
  maskSecret,
  upsertStripePlatformCredentials,
} from '../modules/gateways/stripe/stripePlatformCredentials.js';
import { createStripePlatformClient } from '../modules/gateways/stripe/stripePlatformClient.js';
import { isBilling2FlagEnabled } from '../services/billing2/billingFeatureFlags.js';

export async function getStripePlatformConfig(_req: AuthRequest, res: Response): Promise<void> {
  const creds = await loadStripePlatformCredentials();
  const flag = await isBilling2FlagEnabled('multi_gateway');
  res.json({
    configured: Boolean(creds?.secretKey),
    env: creds?.env ?? 'sandbox',
    source: creds?.source ?? null,
    secret_key_masked: maskSecret(creds?.secretKey),
    webhook_secret_masked: maskSecret(creds?.webhookSecret),
    multi_gateway_enabled: flag,
  });
}

const putSchema = z.object({
  secret_key: z.string().optional(),
  webhook_secret: z.string().optional(),
  env: z.enum(['sandbox', 'production']),
});

export async function putStripePlatformConfig(req: AuthRequest, res: Response): Promise<void> {
  const body = putSchema.parse(req.body ?? {});
  const saved = await upsertStripePlatformCredentials({
    secretKey: body.secret_key,
    webhookSecret: body.webhook_secret,
    env: body.env,
  });
  res.json({
    configured: Boolean(saved.secretMasked),
    env: saved.env,
    secret_key_masked: saved.secretMasked,
    webhook_secret_masked: saved.webhookMasked,
  });
}

export async function postStripePlatformTest(_req: AuthRequest, res: Response): Promise<void> {
  if (!(await isBilling2FlagEnabled('multi_gateway'))) {
    res.status(409).json({
      ok: false,
      error: 'billing2.multi_gateway está OFF. Nenhuma chamada à Stripe.',
    });
    return;
  }
  const creds = await loadStripePlatformCredentials();
  if (!creds?.secretKey) {
    res.status(400).json({ ok: false, error: 'Secret key ausente' });
    return;
  }
  try {
    const client = createStripePlatformClient({ secretKey: creds.secretKey });
    await client.get('/balance');
    res.json({ ok: true, env: creds.env });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao conectar na Stripe';
    res.status(502).json({ ok: false, error: message });
  }
}
