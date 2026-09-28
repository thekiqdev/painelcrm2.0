/**
 * Cifra a senha SMTP para armazenamento em `superadmin_settings` (AES-256-GCM).
 * Material: `smtp_settings_encryption_key` (gerado no servidor), SMTP_SETTINGS_SECRET ou fallback de dev.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

let masterSecretOverride: string | null = null;

export function setSmtpMasterSecret(material: string): void {
  masterSecretOverride = material.trim().length >= 16 ? material.trim() : null;
}

function getRawKeyMaterial(): string {
  return (
    masterSecretOverride ||
    process.env.SMTP_SETTINGS_SECRET ||
    process.env.PROPOSAL_WEBHOOK_SECRET_KEY ||
    ''
  );
}

function deriveKey(): Buffer {
  const raw = getRawKeyMaterial();
  if (raw.length < 16) {
    throw new Error('Chave de cifra SMTP indisponível (mín. 16 caracteres).');
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
  return getRawKeyMaterial().length >= 16;
}
