/**
 * Tokens opacos para links públicos de OS (view/sign) — mesmo padrão dos contratos.
 */
import crypto from 'node:crypto';

const TOKEN_BYTES = Math.min(
  64,
  Math.max(16, parseInt(process.env.SERVICE_ORDER_PUBLIC_TOKEN_BYTES || '32', 10) || 32),
);

const AES_ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

export function hashServiceOrderPublicToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateServiceOrderRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function getTokenEncryptionKey(): Buffer {
  const envKey = process.env.SERVICE_ORDER_PUBLIC_TOKEN_ENCRYPTION_KEY;
  if (envKey != null && String(envKey).trim().length >= 8) {
    return crypto.createHash('sha256').update(String(envKey), 'utf8').digest();
  }
  const jwt = process.env.JWT_SECRET || 'dev-insecure-service-order-public-view';
  return crypto.createHash('sha256').update(`service-order-public-view|${jwt}`, 'utf8').digest();
}

export function encryptServiceOrderTokenForStorage(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(AES_ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptServiceOrderTokenFromStorage(encoded: string | null | undefined): string | null {
  if (encoded == null || !String(encoded).trim()) return null;
  try {
    const buf = Buffer.from(String(encoded), 'base64');
    if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const key = getTokenEncryptionKey();
    const decipher = crypto.createDecipheriv(AES_ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function resolveServiceOrderViewExpiresAt(): string | null {
  const daysRaw = process.env.SERVICE_ORDER_PUBLIC_VIEW_TOKEN_EXPIRY_DAYS;
  if (daysRaw == null || String(daysRaw).trim() === '') return null;
  const days = parseInt(String(daysRaw), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function resolveServiceOrderInviteExpiresAt(): string | null {
  const daysRaw = process.env.SERVICE_ORDER_SIGNATURE_INVITE_EXPIRY_DAYS;
  if (daysRaw == null || String(daysRaw).trim() === '') return null;
  const days = parseInt(String(daysRaw), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
