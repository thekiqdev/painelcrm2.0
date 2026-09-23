import { describe, expect, it } from 'vitest';
import { getChatMediaAccessTtlSeconds } from '../services/media/mediaConfig.js';
import {
  buildMediaRawSignedRelativeUrl,
  extractMediaStorageKeyFromStoredUrl,
  verifyMediaSignature,
} from '../services/media/mediaUrlSigner.js';

describe('Sprint 2 chat media access signing', () => {
  it('TTL default está entre 60s e 24h', () => {
    const ttl = getChatMediaAccessTtlSeconds();
    expect(ttl).toBeGreaterThanOrEqual(60);
    expect(ttl).toBeLessThanOrEqual(24 * 3600);
  });

  it('assina com expiry e verifica', () => {
    const key = 'tenants/aaa/chat_attachment/conversation/bbb/ccc.pdf';
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 900;
    const url = buildMediaRawSignedRelativeUrl(key, { expiresAtUnix });
    expect(url).toContain('/api/media/v1/raw?');
    expect(url).toContain('e=');
    const extracted = extractMediaStorageKeyFromStoredUrl(url);
    expect(extracted).toBe(key);
    const u = new URL(url, 'https://placeholder.local');
    expect(verifyMediaSignature(key, u.searchParams.get('s') || '', expiresAtUnix)).toBe(true);
  });
});
