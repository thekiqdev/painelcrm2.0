/**
 * Lógica partilhada entre o script Super Admin e o worker gradual de cache de avatar WhatsApp.
 */

import type { Pool } from 'pg';
import { isWhatsAppCdnAvatarUrl } from '../utils/uazapiChatIdentity.js';
import { resolveConversationAvatarWithCache } from './whatsappAvatarCacheService.js';
import { persistConversationAvatarToCrm } from './conversationAvatarPersistence.js';
import { isMediaAvatarWhatsappEnabled } from './media/mediaConfig.js';
import { summarizeUrlForLog } from './adminScripts/stripLocalhostMediaUrl.js';

export type CandidateRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  client_id: string | null;
  lead_id: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  external_chat_id: string;
  avatar_url: string | null;
  avatar_cached_url: string | null;
  avatar_source_url: string | null;
  /** Opcional (worker): tentativas prévias */
  avatar_cache_attempts?: number | string | null;
};

export type ReprocessSample = {
  conversation_id: string;
  status: 'cached' | 'skipped' | 'failed';
  before_avatar_url: string | null;
  after_avatar_url: string | null;
  reason: string;
};

export function pickMergedCdnUrl(row: CandidateRow): string | null {
  const src = typeof row.avatar_source_url === 'string' ? row.avatar_source_url.trim() : '';
  const av = typeof row.avatar_url === 'string' ? row.avatar_url.trim() : '';
  if (src && isWhatsAppCdnAvatarUrl(src)) return src;
  if (av && isWhatsAppCdnAvatarUrl(av)) return av;
  return null;
}

function logReprocess(
  mode: 'admin' | 'worker',
  kind: 'success' | 'failed' | 'skipped',
  conversationId: string,
  extra?: string,
): void {
  if (mode === 'admin') {
    const tag =
      kind === 'success'
        ? '[admin-avatar-cache-success]'
        : kind === 'failed'
          ? '[admin-avatar-cache-failed]'
          : '[admin-avatar-cache-skipped]';
    if (kind === 'failed') console.warn(tag, conversationId, extra ?? '');
    else console.log(tag, conversationId, extra ?? '');
  } else {
    const tag =
      kind === 'success'
        ? '[avatar-cache-worker-success]'
        : kind === 'failed'
          ? '[avatar-cache-worker-failed]'
          : '[avatar-cache-worker-skipped]';
    if (kind === 'failed') console.warn(tag, conversationId, extra ?? '');
    else console.log(tag, conversationId, extra ?? '');
  }
}

/**
 * Processa uma conversa candidata: resolve + UPDATE só em sucesso (`avatar_cache_status === 'ok'`).
 * Reseta colunas de backoff em caso de sucesso.
 */
export async function processOneConversationReprocess(
  pool: Pool,
  row: CandidateRow,
  logMode: 'admin' | 'worker' = 'admin',
): Promise<ReprocessSample> {
  const beforeAvatar = row.avatar_url ?? null;

  if (!isMediaAvatarWhatsappEnabled()) {
    return {
      conversation_id: row.id,
      status: 'failed',
      before_avatar_url: beforeAvatar,
      after_avatar_url: beforeAvatar,
      reason: 'MEDIA_AVATAR_WHATSAPP_ENABLED desligado',
    };
  }

  const merged = pickMergedCdnUrl(row);
  if (!merged) {
    logReprocess(logMode, 'skipped', row.id, summarizeUrlForLog(String(beforeAvatar ?? '')));
    return {
      conversation_id: row.id,
      status: 'skipped',
      before_avatar_url: beforeAvatar,
      after_avatar_url: beforeAvatar,
      reason: 'sem URL CDN utilizável (origem)',
    };
  }

  const tenantId = row.tenant_id;

  let patch: Awaited<ReturnType<typeof resolveConversationAvatarWithCache>>;
  try {
    patch = await resolveConversationAvatarWithCache({
      tenantId,
      userId: row.user_id,
      mergedAvatarUrl: merged,
      existingAvatarUrl: row.avatar_url,
      existingCachedUrl: row.avatar_cached_url,
      existingSourceUrl: row.avatar_source_url,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'resolve_failed';
    logReprocess(logMode, 'failed', row.id, msg);
    return {
      conversation_id: row.id,
      status: 'failed',
      before_avatar_url: beforeAvatar,
      after_avatar_url: beforeAvatar,
      reason: msg,
    };
  }

  if (patch.avatar_cache_status !== 'ok') {
    const isFail = patch.avatar_cache_status === 'fetch_failed';
    logReprocess(logMode, isFail ? 'failed' : 'skipped', row.id, String(patch.avatar_cache_status ?? ''));
    return {
      conversation_id: row.id,
      status: isFail ? 'failed' : 'skipped',
      before_avatar_url: beforeAvatar,
      after_avatar_url: row.avatar_url ?? beforeAvatar,
      reason:
        patch.avatar_cache_status === 'fetch_failed'
          ? 'download/CDN falhou — estado anterior preservado'
          : `status=${patch.avatar_cache_status ?? 'unknown'}`,
    };
  }

  try {
    await pool.query(
      `UPDATE public.chat_conversations
       SET avatar_url = $2::text,
           avatar_cached_url = $3::text,
           avatar_source_url = $4::text,
           avatar_cached_at = $5::timestamptz,
           avatar_cache_status = $6::text,
           avatar_cache_attempts = 0,
           avatar_cache_last_error = NULL,
           avatar_cache_next_retry_at = NULL,
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

    await persistConversationAvatarToCrm(row.user_id, row.client_id, row.lead_id, patch.avatar_url, {
      cachedUrl: patch.avatar_cached_url,
      sourceUrl: patch.avatar_source_url,
      cachedAt: patch.avatar_cached_at,
      status: patch.avatar_cache_status,
    });

    logReprocess(logMode, 'success', row.id, summarizeUrlForLog(String(patch.avatar_url ?? '')));
    return {
      conversation_id: row.id,
      status: 'cached',
      before_avatar_url: beforeAvatar,
      after_avatar_url: patch.avatar_url ?? null,
      reason: 'cache atualizado',
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'update_failed';
    logReprocess(logMode, 'failed', row.id, msg);
    return {
      conversation_id: row.id,
      status: 'failed',
      before_avatar_url: beforeAvatar,
      after_avatar_url: beforeAvatar,
      reason: msg,
    };
  }
}
