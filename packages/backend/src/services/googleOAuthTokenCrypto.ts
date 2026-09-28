/**
 * Cifra access/refresh tokens do Google (AES-256-GCM).
 * Exige GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY (≥16 caracteres).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function deriveKey(): Buffer {
  const raw = process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY || '';
  if (raw.length < 16) {
    throw new Error(
      'GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY não configurada ou muito curta (mín. 16 caracteres).',
    );
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isGoogleOAuthTokenEncryptionConfigured(): boolean {
  return (process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY || '').length >= 16;
}

export function encryptGoogleOAuthToken(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptGoogleOAuthToken(ciphertextB64: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error('Token armazenado inválido');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
