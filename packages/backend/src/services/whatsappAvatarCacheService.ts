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
import {
  analyzeBrokenInternalMediaRaw,
  hasStableInternalCacheRow,
} from './whatsappAvatarBrokenInternalCheck.js';
import { persistConversationAvatarCacheFailure } from './whatsappAvatarCacheBackoff.js';
import { getMediaAvatarWhatsappWorkerMaxFailures } from './media/mediaConfig.js';
import { emitConversationUpdate } from './websocketService.js';

const AUTO_RECACHE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const autoRecacheInFlight = new Set<string>();

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

type AvatarAutoRecacheTrigger = 'manual_sync' | 'open_conversation' | 'identity_refresh';

type AvatarAutoRecacheAttemptResult = {
  eligible: boolean;
  reason: string;
  attempted: boolean;
  success: boolean;
  nextRetryAt: string | null;
};

function parseIsoMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function bestSourceUrl(row: { avatar_source_url: string | null; avatar_url: string | null }): string | null {
  const src = typeof row.avatar_source_url === 'string' ? row.avatar_source_url.trim() : '';
  if (src && isWhatsAppCdnAvatarUrl(src)) return src;
  const fallback = typeof row.avatar_url === 'string' ? row.avatar_url.trim() : '';
  if (fallback && isWhatsAppCdnAvatarUrl(fallback)) return fallback;
  return null;
}

function oldUrlKind(row: {
  avatar_url: string | null;
  avatar_cached_url: string | null;
}): 'internal_raw' | 'whatsapp_cdn' | 'none' | 'other' {
  const pick = [row.avatar_cached_url, row.avatar_url].find((v) => typeof v === 'string' && v.trim()) ?? '';
  const t = pick.trim();
  if (!t) return 'none';
  if (t.includes('/api/media/v1/raw') || t.includes('/api/public/catalog-media/raw')) return 'internal_raw';
  if (isWhatsAppCdnAvatarUrl(t)) return 'whatsapp_cdn';
  return 'other';
}

function shouldRespectCooldown(trigger: AvatarAutoRecacheTrigger): boolean {
  return trigger !== 'manual_sync' && trigger !== 'identity_refresh';
}

export async function attemptConversationAvatarAutoRecache(params: {
  conversationId: string;
  userId: string;
  tenantId: string | null;
  trigger: AvatarAutoRecacheTrigger;
  force?: boolean;
}): Promise<AvatarAutoRecacheAttemptResult> {
  if (!isMediaAvatarWhatsappEnabled()) {
    return {
      eligible: false,
      reason: 'media_avatar_feature_disabled',
      attempted: false,
      success: false,
      nextRetryAt: null,
    };
  }
  if (autoRecacheInFlight.has(params.conversationId)) {
    return {
      eligible: false,
      reason: 'already_in_flight',
      attempted: false,
      success: false,
      nextRetryAt: null,
    };
  }
  autoRecacheInFlight.add(params.conversationId);
  try {
    const rowRes = await pool.query<{
      id: string;
      user_id: string;
      client_id: string | null;
      lead_id: string | null;
      avatar_url: string | null;
      avatar_cached_url: string | null;
      avatar_source_url: string | null;
      avatar_cache_status: string | null;
      avatar_cache_attempts: number | null;
      avatar_cache_next_retry_at: string | null;
      avatar_cache_last_error: string | null;
      avatar_cached_at: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT c.id::text, c.user_id::text, c.client_id::text, c.lead_id::text, c.avatar_url, c.avatar_cached_url,
              c.avatar_source_url, c.avatar_cache_status, c.avatar_cache_attempts,
              c.avatar_cache_next_retry_at::text, c.avatar_cache_last_error, c.avatar_cached_at::text, c.metadata
       FROM chat_conversations c
       WHERE c.id = $1::uuid
         AND c.user_id = $2::uuid
       LIMIT 1`,
      [params.conversationId, params.userId],
    );
    const row = rowRes.rows[0];
    if (!row) {
      return {
        eligible: false,
        reason: 'conversation_not_found',
        attempted: false,
        success: false,
        nextRetryAt: null,
      };
    }

    const sourceUrl = bestSourceUrl(row);
    const broken = await analyzeBrokenInternalMediaRaw({
      avatar_url: row.avatar_url,
      avatar_cached_url: row.avatar_cached_url,
      avatar_cache_status: row.avatar_cache_status,
    });
    const hasValidStableCache = hasStableInternalCacheRow(row.avatar_cached_url) && !broken.broken;
    const status = String(row.avatar_cache_status || '').trim().toLowerCase();
    const fetchFailed = status === 'fetch_failed';
    const sourceWithoutValidCache = Boolean(sourceUrl && !hasValidStableCache);

    const eligible = fetchFailed || broken.broken || sourceWithoutValidCache;
    const reason = fetchFailed
      ? 'fetch_failed'
      : broken.broken
        ? broken.motives[0] ?? 'broken_internal_cache'
        : sourceWithoutValidCache
          ? 'source_without_valid_internal_cache'
          : 'cache_already_valid';

    const nextRetryMs = parseIsoMs(row.avatar_cache_next_retry_at);
    const lastAttemptRaw =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata._avatar_auto_recache_last_attempt_at as string | null | undefined)
        : null;
    const lastAttemptMs = parseIsoMs(lastAttemptRaw);
    const cooldownWindowActive =
      lastAttemptMs != null && Date.now() - lastAttemptMs < AUTO_RECACHE_COOLDOWN_MS;
    const retryBlocked = nextRetryMs != null && nextRetryMs > Date.now();
    const respectCooldown = !params.force && shouldRespectCooldown(params.trigger);

    if (!eligible) {
      console.log('[avatar-auto-recache]', {
        conversationId: row.id,
        tenantId: params.tenantId,
        trigger: params.trigger,
        eligible,
        reason,
        sourceUrlKind: sourceUrl ? 'whatsapp_cdn' : 'none',
        previousCacheKind: oldUrlKind(row),
        previousCacheValid: hasValidStableCache,
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      });
      return {
        eligible,
        reason,
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      };
    }
    if (!sourceUrl) {
      console.log('[avatar-auto-recache]', {
        conversationId: row.id,
        tenantId: params.tenantId,
        trigger: params.trigger,
        eligible,
        reason: 'missing_whatsapp_source_url',
        sourceUrlKind: 'none',
        previousCacheKind: oldUrlKind(row),
        previousCacheValid: hasValidStableCache,
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      });
      return {
        eligible: true,
        reason: 'missing_whatsapp_source_url',
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      };
    }
    if (respectCooldown && cooldownWindowActive) {
      console.log('[avatar-auto-recache]', {
        conversationId: row.id,
        tenantId: params.tenantId,
        trigger: params.trigger,
        eligible,
        reason: 'cooldown_24h_active',
        sourceUrlKind: 'whatsapp_cdn',
        previousCacheKind: oldUrlKind(row),
        previousCacheValid: hasValidStableCache,
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      });
      return {
        eligible: true,
        reason: 'cooldown_24h_active',
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      };
    }
    if (!params.force && retryBlocked) {
      console.log('[avatar-auto-recache]', {
        conversationId: row.id,
        tenantId: params.tenantId,
        trigger: params.trigger,
        eligible,
        reason: 'next_retry_at_in_future',
        sourceUrlKind: 'whatsapp_cdn',
        previousCacheKind: oldUrlKind(row),
        previousCacheValid: hasValidStableCache,
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      });
      return {
        eligible: true,
        reason: 'next_retry_at_in_future',
        attempted: false,
        success: false,
        nextRetryAt: row.avatar_cache_next_retry_at,
      };
    }

    const patch = await resolveConversationAvatarWithCache({
      tenantId: params.tenantId,
      userId: row.user_id,
      mergedAvatarUrl: sourceUrl,
      existingAvatarUrl: row.avatar_url,
      existingCachedUrl: row.avatar_cached_url,
      existingSourceUrl: row.avatar_source_url,
    });
    const nowIso = new Date().toISOString();
    const nextMetadata = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      _avatar_auto_recache_last_attempt_at: nowIso,
      _avatar_auto_recache_last_trigger: params.trigger,
    };

    if (patch.avatar_cache_status === 'ok' && patch.avatar_url && patch.avatar_cached_url) {
      await pool.query(
        `UPDATE chat_conversations
         SET avatar_url = $2::text,
             avatar_cached_url = $3::text,
             avatar_source_url = COALESCE($4::text, avatar_source_url),
             avatar_cached_at = COALESCE($5::timestamptz, now()),
             avatar_cache_status = 'ok',
             avatar_cache_attempts = 0,
             avatar_cache_last_error = NULL,
             avatar_cache_next_retry_at = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
             updated_at = now()
         WHERE id = $1::uuid`,
        [row.id, patch.avatar_url, patch.avatar_cached_url, patch.avatar_source_url, patch.avatar_cached_at, JSON.stringify(nextMetadata)],
      );
      await persistConversationAvatarToCrm(row.user_id, row.client_id, row.lead_id, patch.avatar_url, {
        cachedUrl: patch.avatar_cached_url,
        sourceUrl: patch.avatar_source_url,
        cachedAt: patch.avatar_cached_at,
        status: 'ok',
      });
      const convFresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1::uuid LIMIT 1`, [row.id]);
      if (convFresh.rows[0]) emitConversationUpdate(row.user_id, convFresh.rows[0]);
      console.log('[avatar-auto-recache]', {
        conversationId: row.id,
        tenantId: params.tenantId,
        trigger: params.trigger,
        eligible: true,
        reason,
        sourceUrlKind: 'whatsapp_cdn',
        previousCacheKind: oldUrlKind(row),
        previousCacheValid: hasValidStableCache,
        attempted: true,
        success: true,
        nextRetryAt: null,
      });
      return {
        eligible: true,
        reason,
        attempted: true,
        success: true,
        nextRetryAt: null,
      };
    }

    await pool.query(
      `UPDATE chat_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, JSON.stringify(nextMetadata)],
    );
    const maxFailures = getMediaAvatarWhatsappWorkerMaxFailures();
    await persistConversationAvatarCacheFailure(
      pool,
      row,
      'auto_recache_fetch_failed',
      maxFailures,
      '[avatar-auto-recache]',
    );
    const retry = await pool.query<{ avatar_cache_next_retry_at: string | null }>(
      `SELECT avatar_cache_next_retry_at::text FROM chat_conversations WHERE id = $1::uuid`,
      [row.id],
    );
    const nextRetryAt = retry.rows[0]?.avatar_cache_next_retry_at ?? null;
    console.log('[avatar-auto-recache]', {
      conversationId: row.id,
      tenantId: params.tenantId,
      trigger: params.trigger,
      eligible: true,
      reason,
      sourceUrlKind: 'whatsapp_cdn',
      previousCacheKind: oldUrlKind(row),
      previousCacheValid: hasValidStableCache,
      attempted: true,
      success: false,
      nextRetryAt,
    });
    return {
      eligible: true,
      reason,
      attempted: true,
      success: false,
      nextRetryAt,
    };
  } finally {
    autoRecacheInFlight.delete(params.conversationId);
  }
}

export function scheduleConversationAvatarAutoRecache(params: {
  conversationId: string;
  userId: string;
  tenantId: string | null;
  trigger: AvatarAutoRecacheTrigger;
  force?: boolean;
}): void {
  void attemptConversationAvatarAutoRecache(params).catch((err) => {
    console.warn('[avatar-auto-recache]', {
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      trigger: params.trigger,
      attempted: true,
      success: false,
      reason: err instanceof Error ? err.message : 'unknown_error',
    });
  });
}
