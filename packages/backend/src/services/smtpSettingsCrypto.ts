/**
 * Cifra a senha SMTP para armazenamento em `superadmin_settings` (AES-256-GCM).
 * Exige SMTP_SETTINGS_SECRET (≥16 caracteres) para gravar ou alterar senha.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function deriveKey(): Buffer {
  const raw = process.env.SMTP_SETTINGS_SECRET || '';
  if (raw.length < 16) {
    throw new Error(
      'SMTP_SETTINGS_SECRET não configurada ou muito curta (mín. 16 caracteres). Não é possível gravar a senha SMTP.',
    );
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

/** Payload guardado em `smtp_password_encrypted` (base64). */
export function encryptSmtpPassword(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSmtpPassword(ciphertextB64: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error('Credencial SMTP armazenada inválida');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function isSmtpPasswordEncryptionConfigured(): boolean {
  return (process.env.SMTP_SETTINGS_SECRET || '').length >= 16;
}
