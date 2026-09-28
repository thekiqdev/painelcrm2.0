import type { Pool, PoolClient } from 'pg';
import { randomBytes } from 'crypto';
import { setSmtpMasterSecret } from './smtpSettingsCrypto.js';

const KEY_SETTING = 'smtp_settings_encryption_key';

export async function ensureSmtpEncryptionMaterial(pool: Pool | PoolClient): Promise<void> {
  try {
    const r = await pool.query<{ value: string | null }>(
      `SELECT value FROM superadmin_settings WHERE key = $1 LIMIT 1`,
      [KEY_SETTING],
    );
    let material = r.rows[0]?.value?.trim() ?? '';
    if (material.length < 16) {
      material = randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO superadmin_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [KEY_SETTING, material],
      );
      console.log('[smtp-settings] Chave de cifra gerada e persistida em superadmin_settings.');
    }
    setSmtpMasterSecret(material);
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (msg.includes('42P01') || (/superadmin_settings/i.test(msg) && msg.includes('does not exist'))) {
      console.warn('[smtp-settings] superadmin_settings ausente; tentando segredos de ambiente.');
      const raw = process.env.SMTP_SETTINGS_SECRET || process.env.PROPOSAL_WEBHOOK_SECRET_KEY || '';
      if (raw.length >= 16) {
        setSmtpMasterSecret(raw);
      }
      return;
    }
    throw e;
  }
}
