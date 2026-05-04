/**
 * Cifrado AES-256-GCM para access_token e app_secret (WhatsApp oficial).
 * WHATSAPP_OFFICIAL_ENCRYPTION_KEY — mín. 16 caracteres (ou fallback PROPOSAL_WEBHOOK_SECRET_KEY em dev).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

/** Definido no arranque via `superadmin_settings` ou env. */
let masterSecretOverride: string | null = null;

export function setWhatsappOfficialMasterSecret(material: string): void {
  masterSecretOverride = material.trim().length >= 16 ? material.trim() : null;
}

function getRawKeyMaterial(): string {
  return (
    masterSecretOverride ||
    process.env.WHATSAPP_OFFICIAL_ENCRYPTION_KEY ||
    process.env.PROPOSAL_WEBHOOK_SECRET_KEY ||
    ''
  );
}

function deriveKey(): Buffer {
  const raw = getRawKeyMaterial();
  if (raw.length < 16) {
    throw new Error(
      'Chave de cifra WhatsApp oficial indisponível (mín. 16 caracteres). Arranque o servidor ou defina WHATSAPP_OFFICIAL_ENCRYPTION_KEY.',
    );
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptWhatsappOfficialSecret(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptWhatsappOfficialSecret(ciphertextB64: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error('Secret armazenado inválido');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function isWhatsappOfficialEncryptionConfigured(): boolean {
  return getRawKeyMaterial().length >= 16;
}
