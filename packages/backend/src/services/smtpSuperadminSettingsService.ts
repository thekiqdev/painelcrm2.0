/**
 * Configuração SMTP do Super Admin em `superadmin_settings`.
 * Usada pelo teste SMTP e pelo `emailDeliveryService` (notificações transacionais).
 */
import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import {
  decryptSmtpPassword,
  encryptSmtpPassword,
  isSmtpPasswordEncryptionConfigured,
} from './smtpSettingsCrypto.js';
import { ensureSmtpEncryptionMaterial } from './smtpEncryptionBootstrap.js';

export const SMTP_KEY_ENABLED = 'smtp_enabled';
export const SMTP_KEY_HOST = 'smtp_host';
export const SMTP_KEY_PORT = 'smtp_port';
export const SMTP_KEY_USERNAME = 'smtp_username';
export const SMTP_KEY_PASSWORD_ENCRYPTED = 'smtp_password_encrypted';
export const SMTP_KEY_SECURE_MODE = 'smtp_secure_mode';
export const SMTP_KEY_FROM_NAME = 'smtp_from_name';
export const SMTP_KEY_FROM_EMAIL = 'smtp_from_email';
export const SMTP_KEY_REPLY_TO = 'smtp_reply_to_email';

export type SmtpSecureMode = 'none' | 'tls' | 'ssl';

export type SmtpSettingsPublic = {
  ok: true;
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  smtp_secure_mode: SmtpSecureMode;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  smtp_reply_to_email: string | null;
  smtp_password_configured: boolean;
  smtp_password_encryption_configured: boolean;
};

/** Configuração mínima para ligação SMTP (servidor + desencriptar senha). Não expor na API pública. */
export type SmtpRuntimeSendConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secureMode: SmtpSecureMode;
  fromName: string | null;
  fromEmail: string;
  replyTo: string | null;
};

export type SmtpSettingsUpdateInput = {
  smtp_enabled?: boolean;
  smtp_host?: string | null;
  smtp_port?: number;
  smtp_username?: string | null;
  /** Nova senha em texto; omitir mantém; string vazia remove credencial. */
  smtp_password?: string | null;
  smtp_secure_mode?: SmtpSecureMode;
  smtp_from_name?: string | null;
  smtp_from_email?: string | null;
  smtp_reply_to_email?: string | null;
};

const ALL_KEYS = [
  SMTP_KEY_ENABLED,
  SMTP_KEY_HOST,
  SMTP_KEY_PORT,
  SMTP_KEY_USERNAME,
  SMTP_KEY_PASSWORD_ENCRYPTED,
  SMTP_KEY_SECURE_MODE,
  SMTP_KEY_FROM_NAME,
  SMTP_KEY_FROM_EMAIL,
  SMTP_KEY_REPLY_TO,
] as const;

const DEFAULT_PORT = 587;
const DEFAULT_SECURE: SmtpSecureMode = 'tls';

function isMissingSuperadminSettingsTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?superadmin_settings["']?\s+does not exist/i.test(msg);
}

function parseBool(raw: string | null | undefined, defaultValue: boolean): boolean {
  if (raw == null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function parsePort(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return DEFAULT_PORT;
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) return DEFAULT_PORT;
  return n;
}

function parseSecureMode(raw: string | null | undefined): SmtpSecureMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'none' || v === 'tls' || v === 'ssl') return v;
  return DEFAULT_SECURE;
}

async function loadKeyMap(client: Pool | PoolClient): Promise<Record<string, string | null>> {
  const r = await client.query<{ key: string; value: string | null }>(
    `SELECT key, value FROM superadmin_settings WHERE key = ANY($1::text[])`,
    [ALL_KEYS],
  );
  const map: Record<string, string | null> = {};
  for (const row of r.rows) {
    map[row.key] = row.value;
  }
  return map;
}

function mapToPublic(map: Record<string, string | null>): SmtpSettingsPublic {
  const pwd = map[SMTP_KEY_PASSWORD_ENCRYPTED];
  return {
    ok: true,
    smtp_enabled: parseBool(map[SMTP_KEY_ENABLED], false),
    smtp_host: map[SMTP_KEY_HOST]?.trim() || null,
    smtp_port: parsePort(map[SMTP_KEY_PORT]),
    smtp_username: map[SMTP_KEY_USERNAME]?.trim() || null,
    smtp_secure_mode: parseSecureMode(map[SMTP_KEY_SECURE_MODE]),
    smtp_from_name: map[SMTP_KEY_FROM_NAME]?.trim() || null,
    smtp_from_email: map[SMTP_KEY_FROM_EMAIL]?.trim() || null,
    smtp_reply_to_email: map[SMTP_KEY_REPLY_TO]?.trim() || null,
    smtp_password_configured: Boolean(pwd && String(pwd).trim().length > 0),
    smtp_password_encryption_configured: isSmtpPasswordEncryptionConfigured(),
  };
}

/**
 * Carrega credenciais desencriptadas para envio pontual (ex.: e-mail de teste).
 * Requer host, utilizador, senha gravada e remetente (chave de cifra via bootstrap ou env).
 */
export async function getSmtpRuntimeConfigForSendOrThrow(): Promise<SmtpRuntimeSendConfig> {
  await ensureSmtpEncryptionMaterial(pool);
  const map = await loadKeyMap(pool);
  const host = map[SMTP_KEY_HOST]?.trim() ?? '';
  const user = map[SMTP_KEY_USERNAME]?.trim() ?? '';
  const fromEmail = map[SMTP_KEY_FROM_EMAIL]?.trim() ?? '';
  const enc = map[SMTP_KEY_PASSWORD_ENCRYPTED]?.trim() ?? '';

  if (!host) {
    throw new Error('Configure o host SMTP antes de enviar um teste.');
  }
  if (!user) {
    throw new Error('Configure o utilizador SMTP antes de enviar um teste.');
  }
  if (!fromEmail) {
    throw new Error('Configure o e-mail do remetente antes de enviar um teste.');
  }
  if (!enc) {
    throw new Error('Configure e guarde a senha SMTP antes de enviar um teste.');
  }
  if (!isSmtpPasswordEncryptionConfigured()) {
    throw new Error('Chave de cifra SMTP indisponível; não é possível usar a senha armazenada.');
  }

  let password: string;
  try {
    password = decryptSmtpPassword(enc);
  } catch {
    throw new Error('Não foi possível desencriptar a senha SMTP (chave de cifra desatualizada ou inválida).');
  }

  return {
    host,
    port: parsePort(map[SMTP_KEY_PORT]),
    user,
    password,
    secureMode: parseSecureMode(map[SMTP_KEY_SECURE_MODE]),
    fromName: map[SMTP_KEY_FROM_NAME]?.trim() || null,
    fromEmail,
    replyTo: map[SMTP_KEY_REPLY_TO]?.trim() || null,
  };
}

/** Verificação leve (sem desencriptar) para decidir se o motor pode tentar enviar e-mail. */
export async function isSmtpReadyForSystemEmail(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await ensureSmtpEncryptionMaterial(pool);
    const map = await loadKeyMap(pool);
    if (!parseBool(map[SMTP_KEY_ENABLED], false)) {
      return { ok: false, reason: 'smtp_disabled' };
    }
    if (!map[SMTP_KEY_HOST]?.trim()) return { ok: false, reason: 'smtp_host_missing' };
    if (!map[SMTP_KEY_USERNAME]?.trim()) return { ok: false, reason: 'smtp_username_missing' };
    if (!map[SMTP_KEY_FROM_EMAIL]?.trim()) return { ok: false, reason: 'smtp_from_email_missing' };
    if (!map[SMTP_KEY_PASSWORD_ENCRYPTED]?.trim()) return { ok: false, reason: 'smtp_password_missing' };
    if (!isSmtpPasswordEncryptionConfigured()) return { ok: false, reason: 'smtp_encryption_not_configured' };
    return { ok: true };
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      return { ok: false, reason: 'superadmin_settings_missing' };
    }
    return { ok: false, reason: 'load_error' };
  }
}

export async function getSmtpSuperadminSettings(): Promise<SmtpSettingsPublic> {
  try {
    await ensureSmtpEncryptionMaterial(pool);
    const map = await loadKeyMap(pool);
    return mapToPublic(map);
  } catch (e: unknown) {
    if (isMissingSuperadminSettingsTable(e)) {
      console.warn(
        '[smtpSuperadminSettings] superadmin_settings ausente; devolvendo valores por defeito SMTP desativado.',
      );
      return mapToPublic({});
    }
    throw e;
  }
}

async function upsertValue(client: Pool | PoolClient, key: string, value: string | null): Promise<void> {
  await client.query(
    `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value],
  );
}

async function deleteKey(client: Pool | PoolClient, key: string): Promise<void> {
  await client.query(`DELETE FROM superadmin_settings WHERE key = $1`, [key]);
}

export async function updateSmtpSuperadminSettings(input: SmtpSettingsUpdateInput): Promise<SmtpSettingsPublic> {
  const pwdProvided = Object.prototype.hasOwnProperty.call(input, 'smtp_password');
  const rawPwd = input.smtp_password;

  const client = await pool.connect();
  try {
    if (pwdProvided && rawPwd != null && String(rawPwd).length > 0) {
      await ensureSmtpEncryptionMaterial(client);
    }
    await client.query('BEGIN');

    if (input.smtp_enabled !== undefined) {
      await upsertValue(client, SMTP_KEY_ENABLED, input.smtp_enabled ? 'true' : 'false');
    }
    if (input.smtp_host !== undefined) {
      await upsertValue(client, SMTP_KEY_HOST, input.smtp_host == null ? null : String(input.smtp_host).trim() || null);
    }
    if (input.smtp_port !== undefined) {
      await upsertValue(client, SMTP_KEY_PORT, String(input.smtp_port));
    }
    if (input.smtp_username !== undefined) {
      await upsertValue(
        client,
        SMTP_KEY_USERNAME,
        input.smtp_username == null ? null : String(input.smtp_username).trim() || null,
      );
    }
    if (input.smtp_secure_mode !== undefined) {
      await upsertValue(client, SMTP_KEY_SECURE_MODE, input.smtp_secure_mode);
    }
    if (input.smtp_from_name !== undefined) {
      await upsertValue(
        client,
        SMTP_KEY_FROM_NAME,
        input.smtp_from_name == null ? null : String(input.smtp_from_name).trim() || null,
      );
    }
    if (input.smtp_from_email !== undefined) {
      await upsertValue(
        client,
        SMTP_KEY_FROM_EMAIL,
        input.smtp_from_email == null ? null : String(input.smtp_from_email).trim() || null,
      );
    }
    if (input.smtp_reply_to_email !== undefined) {
      await upsertValue(
        client,
        SMTP_KEY_REPLY_TO,
        input.smtp_reply_to_email == null ? null : String(input.smtp_reply_to_email).trim() || null,
      );
    }

    if (pwdProvided) {
      if (rawPwd == null || String(rawPwd).length === 0) {
        await deleteKey(client, SMTP_KEY_PASSWORD_ENCRYPTED);
      } else {
        const cipher = encryptSmtpPassword(String(rawPwd));
        await upsertValue(client, SMTP_KEY_PASSWORD_ENCRYPTED, cipher);
      }
    }

    await client.query('COMMIT');
    return mapToPublic(await loadKeyMap(pool));
  } catch (e: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (isMissingSuperadminSettingsTable(e)) {
      throw new Error(
        'Tabela superadmin_settings não existe neste banco. Execute as migrações (inclui database/init/31_superadmin_settings.sql).',
      );
    }
    throw e;
  } finally {
    client.release();
  }
}
