import { randomBytes } from 'crypto';
import { pool } from '../../utils/db.js';
import {
  decryptWhatsappOfficialSecret,
  encryptWhatsappOfficialSecret,
  isWhatsappOfficialEncryptionConfigured,
} from './whatsappOfficialSecretCrypto.js';
import { ensureWhatsappOfficialEncryptionMaterial } from './whatsappOfficialEncryptionBootstrap.js';

/** Verify token do webhook Meta — gerado no servidor se o utilizador não enviar (evita 400 na 1.ª configuração). */
export function generateWhatsAppOfficialWebhookVerifyToken(): string {
  return randomBytes(32).toString('hex');
}

export type WhatsappOfficialAccountRow = {
  id: string;
  tenant_id: string | null;
  owner_scope: string;
  business_account_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  is_active: boolean;
  inbox_user_id: string | null;
  app_id: string | null;
  has_app_secret: boolean;
  created_at: string;
  updated_at: string;
};

function mask(s: string | null, show = 4): string {
  if (!s) return '';
  if (s.length <= show) return '****';
  return `${s.slice(0, 2)}…${s.slice(-show)}`;
}

export async function getSuperadminAccount(): Promise<{
  account: (WhatsappOfficialAccountRow & { access_token_preview: string; encryption_configured: boolean }) | null;
}> {
  await ensureWhatsappOfficialEncryptionMaterial(pool);
  if (!isWhatsappOfficialEncryptionConfigured()) {
    return { account: null };
  }
  const r = await pool.query(
    `SELECT id::text, tenant_id::text, owner_scope, business_account_id, phone_number_id,
            display_phone_number, verified_name, status, is_active, inbox_user_id::text, app_id,
            (app_secret_ciphertext IS NOT NULL AND btrim(app_secret_ciphertext) <> '') AS has_app_secret,
            created_at::text, updated_at::text
     FROM whatsapp_official_accounts
     WHERE owner_scope = 'superadmin' AND tenant_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  );
  if (r.rows.length === 0) {
    return { account: null };
  }
  const row = r.rows[0] as WhatsappOfficialAccountRow & { has_app_secret: boolean };
  return {
    account: {
      ...row,
      access_token_preview: '••••',
      encryption_configured: true,
    },
  };
}

export async function getAccountCredentials(accountId: string): Promise<{
  accessToken: string;
  appSecretPlain: string | null;
  phoneNumberId: string;
  businessAccountId: string;
} | null> {
  await ensureWhatsappOfficialEncryptionMaterial(pool);
  const r = await pool.query<{
    access_token_ciphertext: string;
    app_secret_ciphertext: string | null;
    phone_number_id: string;
    business_account_id: string;
  }>(
    `SELECT access_token_ciphertext, app_secret_ciphertext, phone_number_id, business_account_id
     FROM whatsapp_official_accounts WHERE id = $1::uuid LIMIT 1`,
    [accountId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  const accessToken = decryptWhatsappOfficialSecret(row.access_token_ciphertext);
  const appSecretPlain =
    row.app_secret_ciphertext && row.app_secret_ciphertext.trim()
      ? decryptWhatsappOfficialSecret(row.app_secret_ciphertext)
      : null;
  return {
    accessToken,
    appSecretPlain,
    phoneNumberId: row.phone_number_id,
    businessAccountId: row.business_account_id,
  };
}

export async function findAccountByPhoneNumberId(phoneNumberId: string): Promise<{
  id: string;
  inbox_user_id: string | null;
} | null> {
  const r = await pool.query<{ id: string; inbox_user_id: string | null }>(
    `SELECT id::text, inbox_user_id::text FROM whatsapp_official_accounts
     WHERE phone_number_id = $1 AND is_active = true LIMIT 1`,
    [phoneNumberId]
  );
  return r.rows[0] ?? null;
}

/** Erro de validação ao guardar conta (mensagem adequada ao utilizador). */
export class WhatsappOfficialAccountUpsertValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsappOfficialAccountUpsertValidationError';
  }
}

export async function matchWebhookVerifyToken(token: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM whatsapp_official_accounts
     WHERE is_active = true AND webhook_verify_token = $1 LIMIT 1`,
    [token]
  );
  if (r.rows.length > 0) return true;
  const envTok = process.env.WHATSAPP_OFFICIAL_WEBHOOK_VERIFY_TOKEN_FALLBACK || '';
  return envTok.length > 0 && envTok === token;
}

export async function upsertSuperadminAccount(input: {
  business_account_id: string;
  phone_number_id: string;
  access_token: string;
  webhook_verify_token: string;
  app_id?: string | null;
  app_secret?: string | null;
  inbox_user_id: string;
}): Promise<{
  id: string;
  plainAccessTokenForValidation?: string;
  /** Só quando o servidor gerou um verify token novo — mostrar uma vez na Meta. */
  webhook_verify_token_generated?: string;
}> {
  await ensureWhatsappOfficialEncryptionMaterial(pool);
  const encSecret =
    input.app_secret && input.app_secret.trim() ? encryptWhatsappOfficialSecret(input.app_secret.trim()) : null;

  const accessTrim = input.access_token.trim();
  const verifyTrim = input.webhook_verify_token.trim();
  /** Token que acabámos de receber em claro — usar na validação Graph sem novo SELECT/descifrar. */
  const plainForMeta = accessTrim.length > 0 ? accessTrim : undefined;

  const existing = await pool.query<{
    id: string;
    access_token_ciphertext: string | null;
    webhook_verify_token: string | null;
  }>(
    `SELECT id::text, access_token_ciphertext, webhook_verify_token FROM whatsapp_official_accounts
     WHERE owner_scope = 'superadmin' AND tenant_id IS NULL ORDER BY created_at DESC LIMIT 1`
  );

  let encTok: string;
  let verifyTok: string;
  let webhookVerifyGenerated: string | undefined;

  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    if (accessTrim) {
      encTok = encryptWhatsappOfficialSecret(accessTrim);
    } else {
      const prev = row.access_token_ciphertext?.trim();
      if (!prev) {
        throw new WhatsappOfficialAccountUpsertValidationError(
          'Cole o access token (ainda não existe token guardado para esta conta).'
        );
      }
      encTok = prev;
    }
    if (verifyTrim) {
      verifyTok = verifyTrim;
    } else {
      const prev = row.webhook_verify_token?.trim();
      if (prev) {
        verifyTok = prev;
      } else {
        verifyTok = generateWhatsAppOfficialWebhookVerifyToken();
        webhookVerifyGenerated = verifyTok;
      }
    }

    const id = row.id;
    await pool.query(
      `UPDATE whatsapp_official_accounts SET
         business_account_id = $2,
         phone_number_id = $3,
         access_token_ciphertext = $4,
         webhook_verify_token = $5,
         app_id = $6,
         app_secret_ciphertext = COALESCE($7, app_secret_ciphertext),
         inbox_user_id = $8,
         status = 'pending',
         is_active = true,
         updated_at = NOW()
       WHERE id = $1::uuid`,
      [id, input.business_account_id, input.phone_number_id, encTok, verifyTok, input.app_id ?? null, encSecret, input.inbox_user_id]
    );
    const base: {
      id: string;
      plainAccessTokenForValidation?: string;
      webhook_verify_token_generated?: string;
    } = { id };
    if (plainForMeta) base.plainAccessTokenForValidation = plainForMeta;
    if (webhookVerifyGenerated) base.webhook_verify_token_generated = webhookVerifyGenerated;
    return base;
  }

  if (!accessTrim) {
    throw new WhatsappOfficialAccountUpsertValidationError(
      'Na primeira configuração, cole o access token permanente da Meta.'
    );
  }
  encTok = encryptWhatsappOfficialSecret(accessTrim);
  if (verifyTrim) {
    verifyTok = verifyTrim;
  } else {
    verifyTok = generateWhatsAppOfficialWebhookVerifyToken();
    webhookVerifyGenerated = verifyTok;
  }

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO whatsapp_official_accounts (
       tenant_id, owner_scope, business_account_id, phone_number_id,
       access_token_ciphertext, webhook_verify_token, app_id, app_secret_ciphertext,
       status, is_active, inbox_user_id
     ) VALUES (
       NULL, 'superadmin', $1, $2, $3, $4, $5, $6, 'pending', true, $7
     ) RETURNING id::text`,
    [
      input.business_account_id,
      input.phone_number_id,
      encTok,
      verifyTok,
      input.app_id ?? null,
      encSecret,
      input.inbox_user_id,
    ]
  );
  return {
    id: ins.rows[0]!.id,
    plainAccessTokenForValidation: accessTrim,
    ...(webhookVerifyGenerated ? { webhook_verify_token_generated: webhookVerifyGenerated } : {}),
  };
}

export async function updateAccountStatus(accountId: string, status: string, meta?: { display_phone?: string; verified?: string }): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_official_accounts SET
       status = $2,
       display_phone_number = COALESCE($3, display_phone_number),
       verified_name = COALESCE($4, verified_name),
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [accountId, status, meta?.display_phone ?? null, meta?.verified ?? null]
  );
}

/** Desliga o número oficial (envio pausa até nova ligação com token válido). */
export async function disconnectSuperadminOfficialAccount(): Promise<{ ok: boolean }> {
  const ex = await pool.query<{ id: string }>(
    `SELECT id::text FROM whatsapp_official_accounts
     WHERE owner_scope = 'superadmin' AND tenant_id IS NULL
     ORDER BY created_at DESC LIMIT 1`
  );
  if (ex.rows.length === 0) return { ok: true };
  await pool.query(
    `UPDATE whatsapp_official_accounts SET
       status = 'disabled',
       is_active = false,
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [ex.rows[0]!.id]
  );
  return { ok: true };
}

export { mask };
