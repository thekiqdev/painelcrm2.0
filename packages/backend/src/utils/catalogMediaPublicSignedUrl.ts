import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import path from 'path';

/** Path fixo: não termina em .png — evita nginx a servir ficheiros estáticos em vez do proxy /api. */
export const CATALOG_MEDIA_PUBLIC_RAW_PATH = '/api/public/catalog-media/raw';

function getCatalogMediaSigningSecret(): string {
  const s =
    process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';
  return s || 'dev-only-catalog-media-signing';
}

/**
 * Aceita assinaturas feitas com qualquer segredo já usado em produção (rotação de JWT ou token dedicado).
 * Inclui CATALOG_MEDIA_PUBLIC_TOKEN_SECRET_PREVIOUS durante migração de segredo.
 */
function getCatalogMediaVerificationSecrets(): string[] {
  const catalog = process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  const prev = process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET_PREVIOUS?.trim();
  const out: string[] = [];
  const add = (secret: string | undefined) => {
    if (secret && !out.includes(secret)) out.push(secret);
  };
  add(catalog);
  add(jwt);
  add(prev);
  if (!catalog && !jwt) add('dev-only-catalog-media-signing');
  return out;
}

export function signCatalogMediaPublicQuery(relativeKey: string): { k: string; s: string } {
  const k = Buffer.from(relativeKey, 'utf8').toString('base64url');
  const s = createHmac('sha256', getCatalogMediaSigningSecret()).update(k).digest('base64url');
  return { k, s };
}

export function verifyCatalogMediaPublicQuery(k: string, s: string): boolean {
  const sigBuf = Buffer.from(s);
  for (const secret of getCatalogMediaVerificationSecrets()) {
    const expected = createHmac('sha256', secret).update(k).digest('base64url');
    const a = Buffer.from(expected);
    if (a.length === sigBuf.length && timingSafeEqual(a, sigBuf)) return true;
  }
  return false;
}

export function resolveCatalogMediaPublicOrigin(req: Request): string {
  const envBase = process.env.CATALOG_MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const apiBase = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .find(Boolean);
  const forwardedSslOn = String(req.headers['x-forwarded-ssl'] || '').toLowerCase() === 'on';
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')
    .map((h) => h.trim())
    .find(Boolean);
  const protocol =
    forwardedProto === 'https' || req.secure || forwardedSslOn
      ? 'https'
      : forwardedProto === 'http'
        ? 'http'
        : req.protocol;
  const host = forwardedHost || req.get('host') || 'localhost';
  return envBase || apiBase || `${protocol}://${host}`;
}

export function buildCatalogMediaRawSignedPublicUrl(origin: string, relativeKey: string): string {
  const { k, s } = signCatalogMediaPublicQuery(relativeKey);
  const qs = new URLSearchParams({ k, s }).toString();
  return `${origin.replace(/\/$/, '')}${CATALOG_MEDIA_PUBLIC_RAW_PATH}?${qs}`;
}

/**
 * URL assinada só com path + query (sem host). Preferir gravar na BD para não fixar localhost/porta errados.
 * O browser ou `getApiUrl()` em dev prefixam o origin correto.
 */
export function buildCatalogMediaRawSignedRelativeUrl(relativeKey: string): string {
  const { k, s } = signCatalogMediaPublicQuery(relativeKey);
  const qs = new URLSearchParams({ k, s }).toString();
  return `${CATALOG_MEDIA_PUBLIC_RAW_PATH}?${qs}`;
}

/**
 * Extrai a chave relativa (ex.: tenants/.../file.png) de URLs antigas gravadas na BD.
 */
export function extractCatalogMediaRelativeKeyFromStoredUrl(stored: string): string | null {
  const t = stored.trim();
  if (!t) return null;
  try {
    /** Aceita URL relativa `/api/public/catalog-media/raw?...` gravada na BD. */
    const u = new URL(t, 'https://placeholder.local');
    const p = u.pathname;
    const legacyMedia = '/media/catalog/';
    const legacyApi = '/api/catalog-media/public/';
    if (p.startsWith(legacyMedia)) {
      return p
        .slice(legacyMedia.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
    }
    if (p.startsWith(legacyApi)) {
      return p
        .slice(legacyApi.length)
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
    }
    if (p.includes(CATALOG_MEDIA_PUBLIC_RAW_PATH)) {
      const k = u.searchParams.get('k');
      if (!k) return null;
      try {
        return Buffer.from(k, 'base64url').toString('utf8');
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Re-emite `/api/public/catalog-media/raw?k=&s=` com o segredo atual (mantém o path lógico em `k`).
 * Evita 403 no browser quando o JWT_SECRET foi rodado mas a BD ainda tem query antiga.
 */
export function refreshCatalogMediaRelativeSignedUrl(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const t = String(stored).trim();
  if (!t) return null;
  const key = extractCatalogMediaRelativeKeyFromStoredUrl(t);
  if (!key) return t;
  if (key.includes('..') || path.isAbsolute(key) || key.startsWith('/')) return t;
  return buildCatalogMediaRawSignedRelativeUrl(key);
}

export function rewriteStoredCatalogMediaUrlForClient(req: Request, stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const s = String(stored).trim();
  if (!s) return null;
  const key = extractCatalogMediaRelativeKeyFromStoredUrl(s);
  if (!key) return s;
  if (key.includes('..') || path.isAbsolute(key) || key.startsWith('/')) return s;
  const origin = resolveCatalogMediaPublicOrigin(req);
  return buildCatalogMediaRawSignedPublicUrl(origin, key);
}
