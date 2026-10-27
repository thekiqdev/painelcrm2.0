import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Prefixo público da chave (`pcrm_` + 7 caracteres). Não autentica sozinho. */
export const API_KEY_PREFIX_LENGTH = 12;

export const API_KEY_SCOPE_LEADS_CREATE = 'leads.create' as const;

export function generateApiKeySecret(): string {
  return `pcrm_${randomBytes(32).toString('base64url')}`;
}

export function apiKeyPrefix(secret: string): string {
  return secret.slice(0, API_KEY_PREFIX_LENGTH);
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function apiKeyHashMatches(secret: string, hashHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(hashHex)) return false;
  const got = createHash('sha256').update(secret, 'utf8').digest();
  const expected = Buffer.from(hashHex, 'hex');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
