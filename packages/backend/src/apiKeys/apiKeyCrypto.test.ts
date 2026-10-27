import { describe, expect, it } from 'vitest';
import {
  API_KEY_PREFIX_LENGTH,
  apiKeyHashMatches,
  apiKeyPrefix,
  generateApiKeySecret,
  hashApiKey,
} from './apiKeyCrypto.js';

describe('apiKeyCrypto', () => {
  it('gera segredo pcrm_ e prefixo de 12 caracteres', () => {
    const secret = generateApiKeySecret();
    expect(secret.startsWith('pcrm_')).toBe(true);
    expect(secret.length).toBeGreaterThan(API_KEY_PREFIX_LENGTH);
    expect(apiKeyPrefix(secret)).toBe(secret.slice(0, API_KEY_PREFIX_LENGTH));
    expect(apiKeyPrefix(secret)).toHaveLength(12);
  });

  it('hash é SHA-256 hex e não contém o segredo', () => {
    const secret = generateApiKeySecret();
    const hash = hashApiKey(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.includes(secret)).toBe(false);
    expect(apiKeyHashMatches(secret, hash)).toBe(true);
    expect(apiKeyHashMatches(`${secret}x`, hash)).toBe(false);
    expect(apiKeyHashMatches(secret, 'zz')).toBe(false);
  });
});
