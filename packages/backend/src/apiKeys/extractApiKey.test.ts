import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { apiV1RateLimitKey, extractApiKeyFromRequest, readIdempotencyKey } from './extractApiKey.js';

function req(headers: Record<string, string>, ip = '203.0.113.8'): Request {
  return { headers, ip } as Request;
}

describe('extractApiKeyFromRequest', () => {
  it('lê Bearer pcrm_ e X-Api-Key', () => {
    expect(extractApiKeyFromRequest(req({ authorization: 'Bearer pcrm_abc' }))).toBe('pcrm_abc');
    expect(extractApiKeyFromRequest(req({ 'x-api-key': 'pcrm_xyz' }))).toBe('pcrm_xyz');
  });

  it('ignora JWT de sessão', () => {
    expect(extractApiKeyFromRequest(req({ authorization: 'Bearer eyJhbGciOi.jwt' }))).toBeNull();
  });
});

describe('apiV1RateLimitKey', () => {
  it('agrupa pelo prefixo de 12 caracteres', () => {
    const key = apiV1RateLimitKey(req({ authorization: 'Bearer pcrm_abcdefghijklmnop' }));
    expect(key).toBe('key:pcrm_abcdefg');
  });

  it('sem chave usa o IP', () => {
    expect(apiV1RateLimitKey(req({}))).toBe('ip:203.0.113.8');
  });
});

describe('readIdempotencyKey', () => {
  it('recusa chave longa demais', () => {
    const result = readIdempotencyKey(req({ 'idempotency-key': 'x'.repeat(129) }));
    expect(result.error).toMatch(/128/);
  });

  it('aceita até 128', () => {
    const result = readIdempotencyKey(req({ 'idempotency-key': 'pedido-1' }));
    expect(result.key).toBe('pedido-1');
  });
});
