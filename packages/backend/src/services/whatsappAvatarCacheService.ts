/**
 * Descarrega avatar da CDN WhatsApp, grava em catalog-media (scope whatsapp_avatar)
 * e devolve URL pública assinada. Nunca apaga avatar existente quando o fetch falha.
 */

import {
  assertAllowedImageUpload,
  buildCatalogMediaRelativeKey,
  saveCatalogMediaBuffer,
} from './catalogMediaUploadService.js';
import { buildCatalogMediaRawSignedRelativeUrl } from '../utils/catalogMediaPublicSignedUrl.js';
import {
  isPersistentStoredAvatarUrl,
  isUsablePersistedAvatar,
  isWhatsAppCdnAvatarUrl,
  mergeAvatarForFinalField,
} from '../utils/uazapiChatIdentity.js';
import { pool } from '../utils/db.js';
import { persistConversationAvatarToCrm } from './conversationAvatarPersistence.js';
import { isMediaAvatarWhatsappEnabled } from './media/mediaConfig.js';
import { cacheRemoteUrl } from './media/mediaService.js';

const MAX_BYTES = 2 * 1024 * 1024;

function bufferLooksLikeImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return true;
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  )
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

function allowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'whatsapp.net' ||
    h.endsWith('.whatsapp.net') ||
    h === 'whatsapp.com' ||
    h.endsWith('.whatsapp.com')
  );
}

function whatsappCdnFetchHeaders(): Record<string, string> {
  return {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: 'https://web.whatsapp.com/',
  };
}

async function fetchImageFromWhatsAppCdn(
  sourceUrl: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  let u: URL;
  try {
    u = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !allowedHost(u.hostname)) return null;

  const fullHeaders = whatsappCdnFetchHeaders();

  let res = await fetch(u.toString(), { method: 'GET', redirect: 'follow', headers: fullHeaders });
  if (!res.ok && (res.status === 403 || res.status === 401)) {
    res = await fetch(u.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': fullHeaders['User-Agent'],
        Referer: 'https://web.whatsapp.com/',
      },
    });
  }
  if (!res.ok) {
    console.warn('[whatsapp-avatar-cache] upstream_http_error', { status: res.status, host: u.hostname });
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    console.warn('[whatsapp-avatar-cache] bad_size', { length: buf.length });
    return null;
  }
  const rawCt = res.headers.get('content-type') || '';
  const ct = normalizeImageContentType(rawCt, buf);
  if (!ct) {
    console.warn('[whatsapp-avatar-cache] not_image', { contentType: rawCt.slice(0, 80) });
    return null;
  }
  return { buf, contentType: ct };
}

export async function cacheWhatsappAvatarToCatalog(params: {
  tenantId: string | null;
  userId: string;
  sourceUrl: string;
}): Promise<string | null> {
  if (isMediaAvatarWhatsappEnabled()) {
    let u: URL;
    try {
      u = new URL(params.sourceUrl);
    } catch {
      return null;
    }
    if (u.protocol !== 'https:' || !allowedHost(u.hostname)) return null;

    const fullHeaders = whatsappCdnFetchHeaders();
    const cached = await cacheRemoteUrl({
      tenantId: String(params.tenantId ?? '').trim() || 'no-tenant',
      ownerType: 'user',
      ownerId: params.userId,
      scope: 'whatsapp_avatar',
      sourceUrl: params.sourceUrl,
      metadata: { source: 'whatsapp_avatar_cache' },
      writeAssetRecord: true,
      fetchInit: { method: 'GET', redirect: 'follow', headers: fullHeaders },
      fallbackFetchInit: {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent': fullHeaders['User-Agent'],
          Referer: 'https://web.whatsapp.com/',
        },
      },
    });
    if (cached.ok && cached.relativeUrl) return cached.relativeUrl;
    return null;
  }

  const fetched = await fetchImageFromWhatsAppCdn(params.sourceUrl);
  if (!fetched) return null;
  try {
    assertAllowedImageUpload(fetched.contentType, fetched.buf.length);
  } catch (e) {
    console.warn('[whatsapp-avatar-cache] rejected_type', e);
    return null;
  }
  const key = buildCatalogMediaRelativeKey({
    tenantId: params.tenantId,
    userId: params.userId,
    scope: 'whatsapp_avatar',
    contentType: fetched.contentType,
    originalName: 'whatsapp.jpg',
  });
  await saveCatalogMediaBuffer(key, fetched.buf);
  return buildCatalogMediaRawSignedRelativeUrl(key);
}

export type ResolvedConversationAvatarCache = {
  avatar_url: string | null;
  avatar_cached_url: string | null;
  avatar_source_url: string | null;
  /** null = manter coluna anterior no UPDATE (COALESCE) */
  avatar_cached_at: Date | null;
  avatar_cache_status: string | null;
};

export async function resolveConversationAvatarWithCache(params: {
  tenantId: string | null;
  userId: string;
  mergedAvatarUrl: string | null;
  existingAvatarUrl: string | null;
  existingCachedUrl: string | null;
  existingSourceUrl: string | null;
}): Promise<ResolvedConversationAvatarCache> {
  const merged =
    typeof params.mergedAvatarUrl === 'string' && params.mergedAvatarUrl.trim()
      ? params.mergedAvatarUrl.trim()
      : '';
  const exAv =
    typeof params.existingAvatarUrl === 'string' && params.existingAvatarUrl.trim()
      ? params.existingAvatarUrl.trim()
      : '';
  const exCached =
    typeof params.existingCachedUrl === 'string' && params.existingCachedUrl.trim()
      ? params.existingCachedUrl.trim()
      : '';

  if (!merged) {
    const safeUrl = mergeAvatarForFinalField({
      existingFinalUrl: exAv || null,
      existingCachedUrl: exCached || null,
      incomingCachedUrl: null,
    });
    return {
      avatar_url: safeUrl,
      avatar_cached_url: safeUrl && isPersistentStoredAvatarUrl(safeUrl) ? safeUrl : null,
      avatar_source_url: params.existingSourceUrl?.trim() || null,
      avatar_cached_at: null,
      avatar_cache_status: null,
    };
  }

  if (isPersistentStoredAvatarUrl(merged)) {
    return {
      avatar_url: merged,
      avatar_cached_url: merged,
      avatar_source_url: params.existingSourceUrl?.trim() || null,
      avatar_cached_at: null,
      avatar_cache_status: 'ok',
    };
  }

  if (isUsablePersistedAvatar(merged)) {
    return {
      avatar_url: merged,
      avatar_cached_url: isPersistentStoredAvatarUrl(exCached) ? exCached : null,
      avatar_source_url: params.existingSourceUrl?.trim() || null,
      avatar_cached_at: null,
      avatar_cache_status: 'skipped',
    };
  }

  if (!isWhatsAppCdnAvatarUrl(merged)) {
    const safeFinal = mergeAvatarForFinalField({
      existingFinalUrl: exAv || null,
      existingCachedUrl: exCached || null,
      incomingCachedUrl: null,
    });
    return {
      avatar_url: safeFinal,
      avatar_cached_url: null,
      avatar_source_url: params.existingSourceUrl?.trim() || null,
      avatar_cached_at: null,
      avatar_cache_status: 'skipped',
    };
  }

  const cachedPublic = await cacheWhatsappAvatarToCatalog({
    tenantId: params.tenantId,
    userId: params.userId,
    sourceUrl: merged,
  });

  if (cachedPublic) {
    return {
      avatar_url: cachedPublic,
      avatar_cached_url: cachedPublic,
      avatar_source_url: merged,
      avatar_cached_at: new Date(),
      avatar_cache_status: 'ok',
    };
  }

  console.warn('[whatsapp-avatar-cache] fetch_failed_preserve_existing', {
    tenantId: params.tenantId,
    attemptedHost: (() => {
      try {
        return new URL(merged).hostname;
      } catch {
        return null;
      }
    })(),
  });

  const fallbackFinal = mergeAvatarForFinalField({
    existingFinalUrl: exAv || null,
    existingCachedUrl: exCached || null,
    incomingCachedUrl: null,
  });

  return {
    avatar_url: fallbackFinal,
    avatar_cached_url: null,
    avatar_source_url: merged,
    avatar_cached_at: null,
    avatar_cache_status: 'fetch_failed',
  };
}

/**
 * Reaplica cache + replica para CRM (clients/leads) após vínculos ou dados já gravados com CDN.
 */
export async function ensureConversationAvatarCachedAndReplicateToCrm(params: {
  conversationId: string;
  userId: string;
  tenantId: string | null;
}): Promise<void> {
  const r = await pool.query<{
    id: string;
    avatar_url: string | null;
    avatar_cached_url: string | null;
    avatar_source_url: string | null;
    client_id: string | null;
    lead_id: string | null;
  }>(
    `SELECT id, avatar_url, avatar_cached_url, avatar_source_url, client_id, lead_id
     FROM chat_conversations
     WHERE id = $1::uuid AND user_id = $2::uuid
     LIMIT 1`,
    [params.conversationId, params.userId],
  );
  const row = r.rows[0];
  if (!row) return;

  const patch = await resolveConversationAvatarWithCache({
    tenantId: params.tenantId,
    userId: params.userId,
    mergedAvatarUrl: row.avatar_url,
    existingAvatarUrl: row.avatar_url,
    existingCachedUrl: row.avatar_cached_url,
    existingSourceUrl: row.avatar_source_url,
  });

  await pool.query(
    `UPDATE chat_conversations SET
       avatar_url = COALESCE($2::text, avatar_url),
       avatar_cached_url = COALESCE($3::text, avatar_cached_url),
       avatar_source_url = COALESCE($4::text, avatar_source_url),
       avatar_cached_at = COALESCE($5::timestamptz, avatar_cached_at),
       avatar_cache_status = COALESCE($6::text, avatar_cache_status),
       updated_at = now()
     WHERE id = $1::uuid`,
    [
      row.id,
      patch.avatar_url,
      patch.avatar_cached_url,
      patch.avatar_source_url,
      patch.avatar_cached_at,
      patch.avatar_cache_status,
    ],
  );

  await persistConversationAvatarToCrm(params.userId, row.client_id, row.lead_id, patch.avatar_url, {
    cachedUrl: patch.avatar_cached_url,
    sourceUrl: patch.avatar_source_url,
    cachedAt: patch.avatar_cached_at,
    status: patch.avatar_cache_status,
  });
}

/** Atualiza só clients/leads quando o registro ainda tem URL CDN (sem conversa associada). */
export async function ensureCrmWhatsappAvatarCached(params: {
  kind: 'client' | 'lead';
  entityId: string;
  userId: string;
  tenantId: string | null;
}): Promise<void> {
  const sel =
    params.kind === 'client'
      ? `SELECT whatsapp_avatar_url, whatsapp_avatar_cached_url, whatsapp_avatar_source_url
         FROM clients WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1`
      : `SELECT whatsapp_avatar_url, whatsapp_avatar_cached_url, whatsapp_avatar_source_url
         FROM leads WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1`;

  const r = await pool.query<{
    whatsapp_avatar_url: string | null;
    whatsapp_avatar_cached_url: string | null;
    whatsapp_avatar_source_url: string | null;
  }>(sel, [params.entityId, params.userId]);

  const row = r.rows[0];
  if (!row) return;

  const patch = await resolveConversationAvatarWithCache({
    tenantId: params.tenantId,
    userId: params.userId,
    mergedAvatarUrl: row.whatsapp_avatar_url,
    existingAvatarUrl: row.whatsapp_avatar_url,
    existingCachedUrl: row.whatsapp_avatar_cached_url,
    existingSourceUrl: row.whatsapp_avatar_source_url,
  });

  const upd =
    params.kind === 'client'
      ? `UPDATE clients
         SET whatsapp_avatar_url = COALESCE(NULLIF(btrim(COALESCE($2::text, '')), ''), whatsapp_avatar_url),
             whatsapp_avatar_cached_url = COALESCE(NULLIF(btrim(COALESCE($3::text, '')), ''), whatsapp_avatar_cached_url),
             whatsapp_avatar_source_url = COALESCE(NULLIF(btrim(COALESCE($4::text, '')), ''), whatsapp_avatar_source_url),
             whatsapp_avatar_cached_at = COALESCE($5::timestamptz, whatsapp_avatar_cached_at),
             whatsapp_avatar_cache_status = COALESCE(NULLIF(btrim(COALESCE($6::text, '')), ''), whatsapp_avatar_cache_status),
             updated_at = now()
         WHERE id = $1::uuid`
      : `UPDATE leads
         SET whatsapp_avatar_url = COALESCE(NULLIF(btrim(COALESCE($2::text, '')), ''), whatsapp_avatar_url),
             whatsapp_avatar_cached_url = COALESCE(NULLIF(btrim(COALESCE($3::text, '')), ''), whatsapp_avatar_cached_url),
             whatsapp_avatar_source_url = COALESCE(NULLIF(btrim(COALESCE($4::text, '')), ''), whatsapp_avatar_source_url),
             whatsapp_avatar_cached_at = COALESCE($5::timestamptz, whatsapp_avatar_cached_at),
             whatsapp_avatar_cache_status = COALESCE(NULLIF(btrim(COALESCE($6::text, '')), ''), whatsapp_avatar_cache_status),
             updated_at = now()
         WHERE id = $1::uuid`;

  await pool.query(upd, [
    params.entityId,
    patch.avatar_url,
    patch.avatar_cached_url,
    patch.avatar_source_url,
    patch.avatar_cached_at,
    patch.avatar_cache_status,
  ]);
}
