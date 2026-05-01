/**
 * Proxy autenticado para avatares WhatsApp (pps.whatsapp.net etc.) — o browser não consegue
 * carregar direto (403/hotlink). Usar com Authorization Bearer (fetch em blob no frontend).
 *
 * Diagnóstico em produção:
 * - `GET /api/chat/avatar-proxy` está em `chatRoutes` antes de rotas dinâmicas; nginx repassa `/api/*` ao Node.
 * - Resposta **502** = fetch ao CDN falhou (403/401, corpo vazio, ou não-imagem). Ver logs `[avatar-proxy]`.
 * - **404** no browser com corpo vazio do Express costuma ser rota antiga não deployada ou path errado.
 * - Detalhe extra: `CHAT_AVATAR_DEBUG=true` no backend.
 */

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { chatAvatarDebugLog } from '../utils/chatAvatarDebug.js';

/**
 * Cabeçalhos para pedir `pps.whatsapp.net` a partir do Node.
 * Não usar Sec-Fetch-* (só browsers); alguns CDNs/WAFs rejeitam pedidos “inconsistentes”.
 */
const UPSTREAM_HEADERS_FULL: Record<string, string> = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://web.whatsapp.com/',
};

/** Segundo intento — mínimo (útil se o primeiro devolver 403 em IPs de datacenter). */
const UPSTREAM_HEADERS_MINIMAL: Record<string, string> = {
  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
  'User-Agent': UPSTREAM_HEADERS_FULL['User-Agent'],
  Referer: 'https://web.whatsapp.com/',
};

function bufferLooksLikeImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return true;
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP')
    return true;
  return false;
}

function normalizeImageContentType(ct: string, buf: Buffer): string | null {
  const lower = ct.toLowerCase().split(';')[0].trim();
  if (lower.startsWith('image/')) return lower || 'image/jpeg';
  if ((lower === '' || lower === 'application/octet-stream') && bufferLooksLikeImage(buf)) {
    return 'image/jpeg';
  }
  return null;
}

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

/** Falhas ao buscar imagem no CDN — 502 distingue de 404 “rota inexistente” no Express/nginx. */
const UPSTREAM_ERROR_STATUS = 502;

export async function getChatAvatarProxy(req: AuthRequest, res: Response): Promise<void> {
  const rawParam =
    typeof req.query.url === 'string'
      ? req.query.url
      : Array.isArray(req.query.url)
        ? req.query.url[0]
        : '';

  console.log('[avatar-proxy] request_received', {
    rawUrl:
      typeof rawParam === 'string'
        ? rawParam.length > 200
          ? `${rawParam.slice(0, 200)}…(len=${rawParam.length})`
          : rawParam
        : rawParam,
    userId: req.user?.id ?? req.userId,
    tenantId: req.tenantId,
  });

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
    let upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: { ...UPSTREAM_HEADERS_FULL },
    });

    if (!upstream.ok && (upstream.status === 403 || upstream.status === 401)) {
      upstream = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: { ...UPSTREAM_HEADERS_MINIMAL },
      });
    }

    clearTimeout(to);

    if (!upstream.ok) {
      console.warn('[avatar-proxy] upstream_not_ok', {
        status: upstream.status,
        statusText: upstream.statusText,
        hostname: target.hostname,
      });
      chatAvatarDebugLog('avatar_proxy_upstream_not_ok', {
        status: upstream.status,
        statusText: upstream.statusText,
        urlHostname: target.hostname,
      });
      res.status(UPSTREAM_ERROR_STATUS).end();
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) {
      console.warn('[avatar-proxy] empty_or_too_large', {
        length: buf.length,
        hostname: target.hostname,
      });
      chatAvatarDebugLog('avatar_proxy_empty_or_too_large', {
        length: buf.length,
        urlHostname: target.hostname,
      });
      res.status(UPSTREAM_ERROR_STATUS).end();
      return;
    }

    const rawCt = upstream.headers.get('content-type') || '';
    const contentType = normalizeImageContentType(rawCt, buf);
    if (!contentType) {
      console.warn('[avatar-proxy] bad_content_type', {
        contentType: rawCt.slice(0, 80),
        hostname: target.hostname,
        headHex: buf.subarray(0, 8).toString('hex'),
      });
      chatAvatarDebugLog('avatar_proxy_bad_content_type', {
        contentType: rawCt.slice(0, 80),
        urlHostname: target.hostname,
        headHex: buf.subarray(0, 8).toString('hex'),
      });
      res.status(UPSTREAM_ERROR_STATUS).end();
      return;
    }

    memoryCache.set(cacheKey, {
      expires: Date.now() + MEMORY_CACHE_TTL_MS,
      buffer: buf,
      contentType,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Chat-Avatar-Cache', 'memory-miss');
    res.send(buf);
  } catch (err) {
    clearTimeout(to);
    console.warn('[avatar-proxy] fetch_error', {
      message: err instanceof Error ? err.message : String(err),
      hostname: target.hostname,
    });
    chatAvatarDebugLog('avatar_proxy_fetch_error', {
      message: err instanceof Error ? err.message : String(err),
      urlHostname: target.hostname,
    });
    res.status(UPSTREAM_ERROR_STATUS).end();
  }
}
