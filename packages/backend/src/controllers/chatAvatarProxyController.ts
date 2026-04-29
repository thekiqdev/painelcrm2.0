/**
 * Proxy autenticado para avatares WhatsApp (pps.whatsapp.net etc.) — o browser não consegue
 * carregar direto (403/hotlink). Usar com Authorization Bearer (fetch em blob no frontend).
 */

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MEMORY_CACHE_MAX = 400;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { expires: number; buffer: Buffer; contentType: string };

const memoryCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of memoryCache) {
    if (v.expires <= now) memoryCache.delete(k);
  }
  while (memoryCache.size > MEMORY_CACHE_MAX) {
    const first = memoryCache.keys().next().value as string | undefined;
    if (first) memoryCache.delete(first);
    else break;
  }
}

function isAllowedAvatarHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'whatsapp.net' ||
    h.endsWith('.whatsapp.net') ||
    h === 'whatsapp.com' ||
    h.endsWith('.whatsapp.com')
  );
}

function validateTargetUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!isAllowedAvatarHost(u.hostname)) return null;
  return u;
}

export async function getChatAvatarProxy(req: AuthRequest, res: Response): Promise<void> {
  const rawParam =
    typeof req.query.url === 'string'
      ? req.query.url
      : Array.isArray(req.query.url)
        ? req.query.url[0]
        : '';
  if (!rawParam || typeof rawParam !== 'string' || !rawParam.trim()) {
    res.status(400).json({ error: 'Parâmetro url obrigatório' });
    return;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam.trim());
  } catch {
    res.status(400).json({ error: 'url inválida' });
    return;
  }

  const target = validateTargetUrl(decoded);
  if (!target) {
    res.status(400).json({ error: 'URL não permitida' });
    return;
  }

  const cacheKey = target.toString();
  pruneCache();
  const hit = memoryCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    res.setHeader('Content-Type', hit.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Chat-Avatar-Cache', 'memory-hit');
    res.send(hit.buffer);
    return;
  }

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 25_000);

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'PainelCRM-avatar-proxy/1.0',
      },
    });
    clearTimeout(to);

    if (!upstream.ok) {
      res.status(404).end();
      return;
    }

    const ct = upstream.headers.get('content-type') || '';
    if (!ct.toLowerCase().startsWith('image/')) {
      res.status(404).end();
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) {
      res.status(404).end();
      return;
    }

    memoryCache.set(cacheKey, {
      expires: Date.now() + MEMORY_CACHE_TTL_MS,
      buffer: buf,
      contentType: ct.split(';')[0].trim() || 'image/jpeg',
    });

    res.setHeader('Content-Type', ct.split(';')[0].trim() || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Chat-Avatar-Cache', 'memory-miss');
    res.send(buf);
  } catch {
    clearTimeout(to);
    res.status(404).end();
  }
}
