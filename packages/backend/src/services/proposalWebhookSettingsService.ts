import { pool } from '../utils/db.js';
import {
  encryptWebhookSecret,
  decryptWebhookSecret,
  isWebhookSecretEncryptionConfigured,
} from './proposalWebhookSecretCrypto.js';

export const PROPOSAL_WEBHOOK_EVENT_KEYS = [
  'proposal.public_accepted',
  'proposal.public_rejected',
  'proposal.invoiced',
] as const;

export type ProposalWebhookEventKey = (typeof PROPOSAL_WEBHOOK_EVENT_KEYS)[number];

export interface TenantProposalWebhookSettingsRow {
  tenant_id: string;
  enabled: boolean;
  webhook_url: string | null;
  event_keys: string[];
  has_secret: boolean;
  updated_at: string;
}

function normalizeEventKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const allowed = new Set<string>(PROPOSAL_WEBHOOK_EVENT_KEYS);
  const out: string[] = [];
  for (const k of keys) {
    const s = String(k).trim();
    if (allowed.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

export async function getTenantProposalWebhookSettings(
  tenantId: string
): Promise<TenantProposalWebhookSettingsRow | null> {
  const r = await pool.query<{
    tenant_id: string;
    enabled: boolean;
    webhook_url: string | null;
    event_keys: string[];
    secret_ciphertext: string | null;
    updated_at: string;
  }>(
    `SELECT tenant_id, enabled, webhook_url, event_keys, secret_ciphertext,
            updated_at::text AS updated_at
     FROM tenant_proposal_webhook_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    enabled: row.enabled === true,
    webhook_url: row.webhook_url,
    event_keys: Array.isArray(row.event_keys) ? row.event_keys.map(String) : [],
    has_secret: row.secret_ciphertext != null && String(row.secret_ciphertext).length > 0,
    updated_at: row.updated_at,
  };
}

export async function upsertTenantProposalWebhookSettings(params: {
  tenantId: string;
  userId: string;
  enabled: boolean;
  webhook_url: string | null;
  event_keys: string[];
  /** Novo secret em texto puro; omitir para manter o existente */
  secret_plain?: string | null;
}): Promise<TenantProposalWebhookSettingsRow> {
  if (!isWebhookSecretEncryptionConfigured()) {
    throw new Error(
      'Servidor sem PROPOSAL_WEBHOOK_SECRET_KEY (mín. 16 caracteres). Configure antes de salvar webhooks.'
    );
  }

  const keys = normalizeEventKeys(params.event_keys);
  const url = (params.webhook_url || '').trim() || null;

  if (params.enabled) {
    if (!url || !/^https:\/\//i.test(url)) {
      throw new Error('URL do webhook deve ser HTTPS quando a integração estiver ativa.');
    }
    if (keys.length === 0) {
      throw new Error('Selecione ao menos um tipo de evento.');
    }
  }

  const existing = await pool.query<{ secret_ciphertext: string | null }>(
    `SELECT secret_ciphertext FROM tenant_proposal_webhook_settings WHERE tenant_id = $1`,
    [params.tenantId]
  );
  let secretCipher = existing.rows[0]?.secret_ciphertext ?? null;

  const newSecret = (params.secret_plain || '').trim();
  if (newSecret) {
    secretCipher = encryptWebhookSecret(newSecret);
  } else if (params.enabled && !secretCipher) {
    throw new Error('Informe um secret para assinatura HMAC (exibido apenas ao salvar).');
  }

  await pool.query(
    `INSERT INTO tenant_proposal_webhook_settings (
       tenant_id, enabled, webhook_url, event_keys, secret_ciphertext, updated_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       webhook_url = EXCLUDED.webhook_url,
       event_keys = EXCLUDED.event_keys,
       secret_ciphertext = COALESCE(EXCLUDED.secret_ciphertext, tenant_proposal_webhook_settings.secret_ciphertext),
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [params.tenantId, params.enabled, url, keys, secretCipher, params.userId]
  );

  const out = await getTenantProposalWebhookSettings(params.tenantId);
  if (!out) throw new Error('Falha ao ler configuração de webhook');
  return out;
}

/** Uso interno: entrega outbound */
export async function loadTenantWebhookSecretForDelivery(tenantId: string): Promise<{
  enabled: boolean;
  webhook_url: string;
  event_keys: string[];
  secret: string;
} | null> {
  const r = await pool.query<{
    enabled: boolean;
    webhook_url: string | null;
    event_keys: string[];
    secret_ciphertext: string | null;
  }>(
    `SELECT enabled, webhook_url, event_keys, secret_ciphertext
     FROM tenant_proposal_webhook_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row?.enabled || !row.webhook_url || !row.secret_ciphertext) return null;
  const keys = normalizeEventKeys(row.event_keys);
  if (keys.length === 0) return null;
  let secret: string;
  try {
    secret = decryptWebhookSecret(row.secret_ciphertext);
  } catch {
    return null;
  }
  return {
    enabled: true,
    webhook_url: row.webhook_url,
    event_keys: keys,
    secret,
  };
}
