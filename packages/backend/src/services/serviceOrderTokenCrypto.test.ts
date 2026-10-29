import { describe, expect, it } from 'vitest';
import {
  decryptServiceOrderTokenFromStorage,
  encryptServiceOrderTokenForStorage,
  generateServiceOrderRawToken,
  hashServiceOrderPublicToken,
} from './serviceOrderTokenCrypto.js';

describe('serviceOrderTokenCrypto', () => {
  it('gera token opaco e hash SHA-256 estável', () => {
    const raw = generateServiceOrderRawToken();
    expect(raw.length).toBeGreaterThanOrEqual(32);
    const h1 = hashServiceOrderPublicToken(raw);
    const h2 = hashServiceOrderPublicToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(hashServiceOrderPublicToken(raw + 'x')).not.toBe(h1);
  });

  it('round-trip ciphertext para reemissão no painel', () => {
    const raw = generateServiceOrderRawToken();
    const enc = encryptServiceOrderTokenForStorage(raw);
    expect(enc).toBeTruthy();
    expect(decryptServiceOrderTokenFromStorage(enc)).toBe(raw);
    expect(decryptServiceOrderTokenFromStorage('invalid')).toBeNull();
  });
});
