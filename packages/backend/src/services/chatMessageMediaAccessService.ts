/**
 * Sprint 2 — acesso autenticado a mídia de mensagem:
 * - reemite URL assinada com TTL (sem host UazAPI)
 * - recupera stubs antigos via /message/download + ingestão chat_attachment
 */
import { pool } from '../utils/db.js';
import { SQL_CHAT_ACCESS_PREDICATE } from '../utils/chatConversationAccess.js';
import { uazapiService } from './uazapi.js';
import { getChatMediaAccessTtlSeconds } from './media/mediaConfig.js';
import {
  buildMediaRawSignedRelativeUrl,
  extractMediaStorageKeyFromStoredUrl,
  MEDIA_RAW_SIGNED_PATH,
} from './media/mediaUrlSigner.js';
import { exists } from './media/mediaLocalStorageAdapter.js';
import { rehostChatInboundMediaItems } from './chatInboundMediaPersist.js';
import { getChatbotFlowsPublicBaseUrl } from './chatbotFlows/flowWebhookIn.js';
import {
  attachContractToMetadata,
  buildMessageContract,
  extractUazDownloadMessageId,
  isRealInboundMediaFileUrl,
  mediaItemsFromDownloadPayload,
  normalizeIdForUazDownload,
  sanitizeMediaItemsForDb,
  type ChatMediaItem,
  type ChatMessageKind,
} from '../utils/chatMessageContract.js';

export type ChatMessageMediaAccessResult = {
  url: string;
  relativeUrl: string;
  fileName: string | null;
  mimeType: string | null;
  expiresAt: string;
  expiresAtUnix: number;
  recovered: boolean;
  disposition: 'inline' | 'attachment';
};

function asMediaList(raw: unknown): ChatMediaItem[] {
  if (Array.isArray(raw)) return raw as ChatMediaItem[];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as ChatMediaItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function pickPrimaryMedia(
  items: ChatMediaItem[],
  kindHint: ChatMessageKind | null
): ChatMediaItem | null {
  if (!items.length) return null;
  if (kindHint) {
    const match = items.find((it) => it.type === kindHint);
    if (match) return match;
  }
  return items[0] ?? null;
}

function inferKindFromMessage(opts: {
  media: ChatMediaItem[];
  metadata: Record<string, unknown>;
  body: string | null;
}): ChatMessageKind {
  const fromMedia = opts.media[0]?.type;
  if (fromMedia && fromMedia !== 'unknown') return fromMedia;
  const contract = opts.metadata.message_contract;
  if (contract && typeof contract === 'object') {
    const k = (contract as { kind?: string }).kind;
    if (
      k === 'document' ||
      k === 'image' ||
      k === 'audio' ||
      k === 'video' ||
      k === 'sticker'
    ) {
      return k;
    }
  }
  const mime = String(opts.media[0]?.mimetype || '').toLowerCase();
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('sheet')) return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (opts.body && /📄|documento|\.pdf/i.test(opts.body)) return 'document';
  return 'document';
}

function appendDispositionParams(
  relativeUrl: string,
  disposition: 'inline' | 'attachment',
  fileName: string | null
): string {
  try {
    const u = new URL(relativeUrl, 'https://placeholder.local');
    u.searchParams.set('disposition', disposition);
    if (fileName?.trim()) u.searchParams.set('filename', fileName.trim().slice(0, 180));
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = relativeUrl.includes('?') ? '&' : '?';
    const fn = fileName?.trim()
      ? `&filename=${encodeURIComponent(fileName.trim().slice(0, 180))}`
      : '';
    return `${relativeUrl}${sep}disposition=${disposition}${fn}`;
  }
}

function toAbsoluteMediaUrl(relativeUrl: string): string {
  const path = relativeUrl.trim();
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getChatbotFlowsPublicBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function downloadMediaByExternalId(opts: {
  instanceToken: string;
  externalMessageId: string | null;
  metadata: Record<string, unknown>;
  kind: ChatMessageKind;
}): Promise<ChatMediaItem[]> {
  const envelope = {
    ...opts.metadata,
    id: opts.externalMessageId || opts.metadata.id,
    messageId: opts.externalMessageId || opts.metadata.messageId,
  };
  const rawId =
    extractUazDownloadMessageId(envelope) ||
    (opts.externalMessageId ? String(opts.externalMessageId).trim() : '');
  if (!rawId) return [];

  const norm = normalizeIdForUazDownload(rawId);
  const idVariants = Array.from(new Set(norm === rawId ? [rawId] : [norm, rawId]));

  for (const id of idVariants) {
    try {
      const dl = (await uazapiService.downloadMessageMedia(opts.instanceToken, {
        id,
        return_link: true,
      })) as Record<string, unknown>;
      const items = mediaItemsFromDownloadPayload(dl, opts.kind);
      if (items.length > 0) return items;
    } catch {
      continue;
    }
  }
  return [];
}

async function persistUpdatedMessageMedia(opts: {
  messageId: string;
  direction: 'incoming' | 'outgoing';
  body: string | null;
  media: ChatMediaItem[];
  kind: ChatMessageKind;
  externalMessageId: string | null;
  status: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const mediaArr = sanitizeMediaItemsForDb(opts.media);
  const contract = buildMessageContract({
    direction: opts.direction,
    body: opts.body,
    media: mediaArr,
    kindHint: opts.kind,
    externalMessageId: opts.externalMessageId,
    status: opts.status,
  });
  const metadataMerged = attachContractToMetadata(opts.metadata, contract);
  await pool.query(
    `UPDATE chat_messages
     SET media = $2::jsonb,
         metadata = $3::jsonb
     WHERE id = $1`,
    [opts.messageId, JSON.stringify(mediaArr), JSON.stringify(metadataMerged)]
  );
}

/**
 * Resolve URL temporária assinada para abrir/baixar mídia da mensagem.
 * Se só houver stub, tenta recuperar na UazAPI e persistir no nosso storage.
 */
export async function resolveChatMessageMediaAccess(opts: {
  userId: string;
  messageId: string;
  disposition?: 'inline' | 'attachment';
}): Promise<
  | { ok: true; result: ChatMessageMediaAccessResult; conversationId: string; ownerUserId: string }
  | { ok: false; status: number; error: string }
> {
  const disposition = opts.disposition === 'attachment' ? 'attachment' : 'inline';
  const messageId = String(opts.messageId || '').trim();
  if (!messageId) return { ok: false, status: 400, error: 'messageId inválido' };

  const rowQ = await pool.query<{
    id: string;
    conversation_id: string;
    direction: string;
    body: string | null;
    media: unknown;
    metadata: unknown;
    external_message_id: string | null;
    status: string | null;
    instance_token: string | null;
    instance_user_id: string;
    tenant_owner_user_id: string;
  }>(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.direction,
      m.body,
      m.media,
      m.metadata,
      m.external_message_id,
      m.status,
      i.instance_token,
      i.user_id AS instance_user_id,
      c.user_id AS tenant_owner_user_id
    FROM chat_messages m
    INNER JOIN chat_conversations c ON c.id = m.conversation_id
    INNER JOIN chat_instances i ON i.id = c.instance_id
    WHERE m.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
    `,
    [messageId, opts.userId]
  );

  if (rowQ.rowCount === 0) {
    return { ok: false, status: 404, error: 'Mensagem não encontrada' };
  }

  const row = rowQ.rows[0];
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  let media = asMediaList(row.media);
  const kind = inferKindFromMessage({
    media,
    metadata,
    body: row.body,
  });
  let recovered = false;

  let primary = pickPrimaryMedia(media, kind);
  const hasReal =
    primary != null && isRealInboundMediaFileUrl(primary.url, primary.type || kind);

  if (!hasReal) {
    if (!row.instance_token) {
      return { ok: false, status: 409, error: 'Instância WhatsApp sem token para recuperar mídia' };
    }
    const fromDl = await downloadMediaByExternalId({
      instanceToken: row.instance_token,
      externalMessageId: row.external_message_id,
      metadata,
      kind,
    });
    if (fromDl.length === 0) {
      return {
        ok: false,
        status: 404,
        error: 'Mídia indisponível no provedor (não foi possível recuperar o ficheiro)',
      };
    }
    const prevName = primary?.fileName ?? null;
    const prevMime = primary?.mimetype ?? null;
    const mergedDl = fromDl.map((it, idx) => ({
      ...it,
      fileName: it.fileName || (idx === 0 ? prevName : null) || null,
      mimetype: it.mimetype || (idx === 0 ? prevMime : null) || null,
    }));

    const tenantIdQ = await pool.query<{ tenant_id: string | null }>(
      `SELECT tenant_id::text FROM users WHERE id = $1 LIMIT 1`,
      [row.tenant_owner_user_id]
    );
    const tenantId = tenantIdQ.rows[0]?.tenant_id;
    if (!tenantId) {
      return { ok: false, status: 403, error: 'Tenant da conversa indisponível' };
    }

    media = await rehostChatInboundMediaItems({
      tenantId,
      conversationId: row.conversation_id,
      items: mergedDl,
    });
    primary = pickPrimaryMedia(media, kind);
    if (!primary || !isRealInboundMediaFileUrl(primary.url, primary.type || kind)) {
      return { ok: false, status: 502, error: 'Falha ao persistir mídia recuperada' };
    }

    await persistUpdatedMessageMedia({
      messageId: row.id,
      direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
      body: row.body,
      media,
      kind,
      externalMessageId: row.external_message_id,
      status: row.status,
      metadata,
    });
    recovered = true;
  }

  primary = pickPrimaryMedia(media, kind);
  if (!primary?.url || !isRealInboundMediaFileUrl(primary.url, primary.type || kind)) {
    return { ok: false, status: 404, error: 'Mídia sem URL utilizável' };
  }

  // data: URLs (raro em documento) — devolver como estão (sem TTL)
  if (String(primary.url).startsWith('data:')) {
    return {
      ok: true,
      conversationId: row.conversation_id,
      ownerUserId: row.tenant_owner_user_id,
      result: {
        url: String(primary.url),
        relativeUrl: String(primary.url),
        fileName: primary.fileName ?? null,
        mimeType: primary.mimetype ?? null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        expiresAtUnix: Math.floor(Date.now() / 1000) + 60,
        recovered,
        disposition,
      },
    };
  }

  let storageKey = extractMediaStorageKeyFromStoredUrl(String(primary.url));
  if (!storageKey && /^https?:\/\//i.test(String(primary.url))) {
    // URL remota ainda não rehostada (legado) — tentar ingestão agora
    const tenantIdQ = await pool.query<{ tenant_id: string | null }>(
      `SELECT tenant_id::text FROM users WHERE id = $1 LIMIT 1`,
      [row.tenant_owner_user_id]
    );
    const tenantId = tenantIdQ.rows[0]?.tenant_id;
    if (tenantId) {
      media = await rehostChatInboundMediaItems({
        tenantId,
        conversationId: row.conversation_id,
        items: [primary],
      });
      primary = pickPrimaryMedia(media, kind) || primary;
      storageKey = extractMediaStorageKeyFromStoredUrl(String(primary.url || ''));
      if (storageKey) {
        await persistUpdatedMessageMedia({
          messageId: row.id,
          direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
          body: row.body,
          media,
          kind,
          externalMessageId: row.external_message_id,
          status: row.status,
          metadata,
        });
        recovered = true;
      }
    }
  }

  if (!storageKey) {
    return { ok: false, status: 409, error: 'Mídia sem storage_key interno' };
  }

  try {
    const okFile = await exists(storageKey);
    if (!okFile) {
      return { ok: false, status: 404, error: 'Ficheiro de mídia ausente no storage' };
    }
  } catch {
    return { ok: false, status: 404, error: 'Ficheiro de mídia ausente no storage' };
  }

  const ttl = getChatMediaAccessTtlSeconds();
  const expiresAtUnix = Math.floor(Date.now() / 1000) + ttl;
  let relativeUrl = buildMediaRawSignedRelativeUrl(storageKey, { expiresAtUnix });
  relativeUrl = appendDispositionParams(relativeUrl, disposition, primary.fileName ?? null);
  const absoluteUrl = toAbsoluteMediaUrl(relativeUrl);

  // Manter URL estável sem TTL na BD (refresh acontece neste endpoint).
  // Se a coluna ainda tinha URL remota, já foi atualizada acima.

  return {
    ok: true,
    conversationId: row.conversation_id,
    ownerUserId: row.tenant_owner_user_id,
    result: {
      url: absoluteUrl.includes(MEDIA_RAW_SIGNED_PATH) ? absoluteUrl : relativeUrl,
      relativeUrl,
      fileName: primary.fileName ?? null,
      mimeType: primary.mimetype ?? null,
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      expiresAtUnix,
      recovered,
      disposition,
    },
  };
}
