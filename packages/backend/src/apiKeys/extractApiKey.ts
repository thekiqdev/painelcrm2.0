import type { Request } from 'express';
import { API_KEY_PREFIX_LENGTH } from './apiKeyCrypto.js';

function headerString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string');
    return typeof first === 'string' ? first.trim() : null;
  }
  return null;
}

/** Bearer `pcrm_…` ou `X-Api-Key`. Não lê JWT de sessão. */
export function extractApiKeyFromRequest(req: Request): string | null {
  const auth = headerString(req.headers.authorization);
  if (auth) {
    const match = /^Bearer\s+(\S+)/i.exec(auth);
    if (match?.[1]?.startsWith('pcrm_')) return match[1];
  }
  const xApiKey = headerString(req.headers['x-api-key']);
  if (xApiKey?.startsWith('pcrm_')) return xApiKey;
  return null;
}

export function readIdempotencyKey(req: Request): { key: string | null; error?: string } {
  const raw = headerString(req.headers['idempotency-key']);
  if (!raw) return { key: null };
  if (raw.length > 128) {
    return { key: null, error: 'Idempotency-Key deve ter no máximo 128 caracteres.' };
  }
  return { key: raw };
}

/** 60/min por prefixo da chave. Sem chave, cai no IP (o limiter global de /api também vale). */
export function apiV1RateLimitKey(req: Request): string {
  const secret = extractApiKeyFromRequest(req);
  if (secret && secret.length > API_KEY_PREFIX_LENGTH) {
    return `key:${secret.slice(0, API_KEY_PREFIX_LENGTH)}`;
  }
  return `ip:${req.ip || 'unknown'}`;
}
