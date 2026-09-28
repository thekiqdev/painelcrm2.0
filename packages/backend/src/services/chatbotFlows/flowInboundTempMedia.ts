/**
 * S32.1 — cópia temporária de mídia inbound do wait_input (política B / D32.4).
 * Scope `flow_inbound_temp` ≠ Media Library (D32.2).
 */
import { createHash } from 'crypto';
import {
  getFlowInboundTempMaxBytes,
  getFlowInboundTempTtlHours,
} from '../media/mediaConfig.js';
import { saveFromBuffer } from '../media/mediaService.js';
import { deleteFile } from '../media/mediaLocalStorageAdapter.js';
import {
  buildMediaRawSignedRelativeUrl,
  MEDIA_RAW_SIGNED_PATH,
} from '../media/mediaUrlSigner.js';
import { getChatbotFlowsPublicBaseUrl } from './flowWebhookIn.js';
import { pool } from '../../utils/db.js';
import type { InboundMediaItem } from './waitInputMedia.js';
import {
  pickInboundMedia,
  readWaitInputAccept,
  readWaitInputMediaKinds,
  type WaitInputMediaKind,
} from './waitInputMedia.js';

const FLOW_INBOUND_SCOPE = 'flow_inbound_temp' as const;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'video/mp4',
  'video/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function inferMimeFromBuffer(buf: Buffer, fallback: string): string {
  if (buf.length >= 4) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
    if (
      buf.length >= 12 &&
      buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (buf.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  }
  return fallback;
}

function isAlreadyOurSignedMediaUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.includes(MEDIA_RAW_SIGNED_PATH)) return true;
  try {
    const parsed = new URL(u, 'https://placeholder.local');
    return parsed.pathname.includes(MEDIA_RAW_SIGNED_PATH);
  } catch {
    return false;
  }
}

export function buildAbsoluteMediaRawUrl(relativeUrl: string): string {
  const path = String(relativeUrl || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = getChatbotFlowsPublicBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export type PersistFlowInboundTempResult =
  | {
      ok: true;
      absoluteUrl: string;
      relativeUrl: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      checksum: string;
      expiresAt: string;
      expiresAtUnix: number;
      assetId: string | null;
    }
  | { ok: false; reason: string };

/**
 * Download da origem (UazAPI/CDN) → MEDIA_STORAGE_ROOT (scope flow_inbound_temp) → URL assinada com TTL.
 */
export async function persistFlowInboundTempMedia(opts: {
  tenantId: string;
  conversationId?: string | null;
  sessionId?: string | null;
  sourceUrl: string;
  mimeHint?: string | null;
  originalFilename?: string | null;
  /** Injecção de testes. */
  fetchImpl?: typeof fetch;
}): Promise<PersistFlowInboundTempResult> {
  const sourceUrl = String(opts.sourceUrl || '').trim();
  if (!sourceUrl) return { ok: false, reason: 'source_url_empty' };
  if (!/^https?:\/\//i.test(sourceUrl) && !sourceUrl.startsWith('/')) {
    return { ok: false, reason: 'source_url_invalid' };
  }

  // Já é URL nossa — não re-copiar
  if (isAlreadyOurSignedMediaUrl(sourceUrl)) {
    const ttlHours = getFlowInboundTempTtlHours();
    const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    return {
      ok: true,
      absoluteUrl: buildAbsoluteMediaRawUrl(sourceUrl),
      relativeUrl: sourceUrl.includes(MEDIA_RAW_SIGNED_PATH)
        ? (() => {
            try {
              const u = new URL(sourceUrl, 'https://placeholder.local');
              return `${u.pathname}${u.search}`;
            } catch {
              return sourceUrl;
            }
          })()
        : sourceUrl,
      storageKey: '',
      mimeType: String(opts.mimeHint || 'application/octet-stream'),
      sizeBytes: 0,
      checksum: '',
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      expiresAtUnix,
      assetId: null,
    };
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, reason: 'source_url_not_remote' };
  }

  const max = getFlowInboundTempMaxBytes();
  const ttlHours = getFlowInboundTempTtlHours();
  const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const expiresAt = new Date(expiresAtUnix * 1000).toISOString();
  const fetchFn = opts.fetchImpl || fetch;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    let res: Response;
    try {
      res = await fetchFn(sourceUrl, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'PainelCRM-FlowInboundTemp/1.0',
          Accept: '*/*',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: 'flow_inbound_temp',
          phase: 'download_failed',
          status: res.status,
          sessionId: opts.sessionId || null,
          conversationId: opts.conversationId || null,
        })
      );
      return { ok: false, reason: `remote_http_${res.status}` };
    }

    const contentLength = parseInt(String(res.headers.get('content-length') || '0'), 10);
    if (Number.isFinite(contentLength) && contentLength > max) {
      return { ok: false, reason: 'remote_too_large' };
    }

    const raw = Buffer.from(await res.arrayBuffer());
    if (!raw.length) return { ok: false, reason: 'remote_empty' };
    if (raw.length > max) return { ok: false, reason: 'remote_too_large' };

    let mimeType = String(res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = inferMimeFromBuffer(raw, String(opts.mimeHint || '').trim().toLowerCase() || 'application/pdf');
    }
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

    const mimeOk =
      ALLOWED_MIME.has(mimeType) ||
      mimeType.startsWith('image/') ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/') ||
      mimeType === 'application/pdf';
    if (!mimeOk) {
      return { ok: false, reason: `remote_bad_mime:${mimeType}` };
    }

    const saved = await saveFromBuffer({
      tenantId: opts.tenantId,
      ownerType: 'conversation',
      ownerId: opts.conversationId || null,
      scope: FLOW_INBOUND_SCOPE,
      buffer: raw,
      mimeType,
      originalFilename: opts.originalFilename || null,
      sourceUrl,
      writeAssetRecord: true,
      maxBytes: max,
      metadata: {
        purpose: 'flow_inbound_temp',
        library: false,
        expires_at: expiresAt,
        expires_at_unix: expiresAtUnix,
        session_id: opts.sessionId || null,
        original_mime: mimeType,
        original_filename: opts.originalFilename || null,
      },
    });

    // Re-assinar com TTL (saveFromBuffer assina sem expiry)
    const relativeUrl = buildMediaRawSignedRelativeUrl(saved.storageKey, { expiresAtUnix });
    const absoluteUrl = buildAbsoluteMediaRawUrl(relativeUrl);
    if (!/^https?:\/\//i.test(absoluteUrl)) {
      console.warn(
        JSON.stringify({
          event: 'flow_inbound_temp',
          phase: 'missing_public_base_url',
          hint: 'Defina API_PUBLIC_BASE_URL (ou API_PUBLIC_ORIGIN/PUBLIC_API_URL) para URL absoluta à parceira.',
          sessionId: opts.sessionId || null,
        })
      );
    }

    // Atualiza public_url + metadata no asset (best-effort)
    let assetId: string | null = null;
    try {
      const upd = await pool.query<{ id: string }>(
        `UPDATE public.media_assets
         SET public_url = $2,
             metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE storage_key = $1
         RETURNING id::text`,
        [
          saved.storageKey,
          relativeUrl,
          JSON.stringify({
            purpose: 'flow_inbound_temp',
            library: false,
            expires_at: expiresAt,
            expires_at_unix: expiresAtUnix,
            session_id: opts.sessionId || null,
          }),
        ]
      );
      assetId = upd.rows[0]?.id ?? null;
    } catch (e) {
      console.warn(
        '[flow_inbound_temp] asset update skipped',
        e instanceof Error ? e.message : e
      );
    }

    console.log(
      JSON.stringify({
        event: 'flow_inbound_temp',
        phase: 'persisted',
        tenantId: opts.tenantId,
        sessionId: opts.sessionId || null,
        conversationId: opts.conversationId || null,
        storageKeyPrefix: saved.storageKey.slice(0, 48),
        sizeBytes: saved.sizeBytes,
        mimeType,
        expiresAt,
        assetId,
      })
    );

    return {
      ok: true,
      absoluteUrl,
      relativeUrl,
      storageKey: saved.storageKey,
      mimeType,
      sizeBytes: saved.sizeBytes,
      checksum: saved.checksum || createHash('sha256').update(raw).digest('hex'),
      expiresAt,
      expiresAtUnix,
      assetId,
    };
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : 'persist_failed';
    console.warn(
      JSON.stringify({
        event: 'flow_inbound_temp',
        phase: 'persist_error',
        reason,
        sessionId: opts.sessionId || null,
      })
    );
    return { ok: false, reason };
  }
}

/**
 * Antes do processInboundStep: se wait_input aceita mídia, copia a URL efémera para storage nosso.
 * Em falha de download da mídia que seria aceite → blocked (re-prompt / erro claro).
 */
export async function enrichInboundMediaForWaitInput(opts: {
  tenantId: string;
  conversationId: string;
  sessionId: string;
  waitNodeData: Record<string, unknown> | null | undefined;
  inboundMedia: InboundMediaItem[] | null | undefined;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; inboundMedia: InboundMediaItem[] | null | undefined }
  | { ok: false; reason: string; rejectMessage: string }
> {
  const accept = readWaitInputAccept(opts.waitNodeData);
  if (accept === 'text') {
    return { ok: true, inboundMedia: opts.inboundMedia };
  }

  const mediaKinds = readWaitInputMediaKinds(opts.waitNodeData);
  const picked = pickInboundMedia(opts.inboundMedia, mediaKinds);
  if (!picked) {
    return { ok: true, inboundMedia: opts.inboundMedia };
  }

  if (isAlreadyOurSignedMediaUrl(picked.url)) {
    // Garantir URL absoluta para a parceira
    const absolute = buildAbsoluteMediaRawUrl(picked.url);
    const items = (opts.inboundMedia || []).map((item) => {
      const u = String(item?.url || '').trim();
      if (u === picked.url || isAlreadyOurSignedMediaUrl(u)) {
        return { ...item, url: absolute };
      }
      return item;
    });
    return { ok: true, inboundMedia: items };
  }

  const persisted = await persistFlowInboundTempMedia({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
    sessionId: opts.sessionId,
    sourceUrl: picked.url,
    mimeHint: picked.tipo,
    originalFilename: picked.nome,
    fetchImpl: opts.fetchImpl,
  });

  if (!persisted.ok) {
    const custom = String(opts.waitNodeData?.invalid_message || '').trim();
    return {
      ok: false,
      reason: persisted.reason,
      rejectMessage:
        custom ||
        'Não foi possível guardar o arquivo enviado. Por favor, envie novamente em alguns instantes.',
    };
  }

  const items = (opts.inboundMedia || []).map((item) => {
    const u = String(item?.url || '').trim();
    if (u !== picked.url) return item;
    return {
      ...item,
      url: persisted.absoluteUrl,
      mimetype: persisted.mimeType || item.mimetype || item.mime,
      fileName: picked.nome || item.fileName || item.filename,
      // asset id via campo extra (engine ignora; runner pode gravar depois)
      assetId: persisted.assetId,
    } as InboundMediaItem & { assetId?: string | null };
  });

  return { ok: true, inboundMedia: items };
}

export function findWaitInputNodeData(
  graph: { nodes?: Array<{ id?: string; type?: string; data?: unknown }> },
  currentNodeId: string | null | undefined
): Record<string, unknown> | null {
  const id = String(currentNodeId || '').trim();
  if (!id) return null;
  for (const n of graph.nodes || []) {
    if (String(n?.id || '') !== id) continue;
    if (String(n?.type || '') !== 'wait_input') return null;
    return n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : {};
  }
  return null;
}

/** Purge: soft-delete + apaga ficheiro de assets flow_inbound_temp expirados. */
export async function purgeExpiredFlowInboundTempMedia(limit = 50): Promise<{
  scanned: number;
  softDeleted: number;
  filesRemoved: number;
}> {
  const lim = Math.max(1, Math.min(200, limit));
  let softDeleted = 0;
  let filesRemoved = 0;

  const due = await pool.query<{
    id: string;
    storage_key: string;
    tenant_id: string;
  }>(
    `SELECT id::text, storage_key, tenant_id::text
     FROM public.media_assets
     WHERE scope = $1
       AND deleted_at IS NULL
       AND status = 'ready'
       AND (
         (metadata ? 'expires_at' AND (metadata->>'expires_at')::timestamptz < now())
         OR (NOT (metadata ? 'expires_at') AND created_at + ($2::text || ' hours')::interval < now())
       )
     ORDER BY created_at ASC
     LIMIT $3`,
    [FLOW_INBOUND_SCOPE, String(getFlowInboundTempTtlHours()), lim]
  );

  for (const row of due.rows) {
    try {
      await pool.query(
        `UPDATE public.media_assets
         SET status = 'deleted', deleted_at = now(), updated_at = now()
         WHERE id = $1::uuid AND deleted_at IS NULL`,
        [row.id]
      );
      softDeleted += 1;
      try {
        await deleteFile(row.storage_key);
        filesRemoved += 1;
        await pool.query(
          `UPDATE public.media_assets SET status = 'purged', updated_at = now() WHERE id = $1::uuid`,
          [row.id]
        );
      } catch (e) {
        console.warn(
          '[flow_inbound_temp] file purge failed',
          row.storage_key.slice(0, 48),
          e instanceof Error ? e.message : e
        );
      }
      console.log(
        JSON.stringify({
          event: 'flow_inbound_temp',
          phase: 'purge',
          assetId: row.id,
          tenantId: row.tenant_id,
          storageKeyPrefix: row.storage_key.slice(0, 48),
        })
      );
    } catch (e) {
      console.warn(
        '[flow_inbound_temp] soft-delete failed',
        row.id,
        e instanceof Error ? e.message : e
      );
    }
  }

  return { scanned: due.rows.length, softDeleted, filesRemoved };
}

export function isFlowInboundTempLibraryScope(scope: string): boolean {
  return String(scope || '').trim() === FLOW_INBOUND_SCOPE;
}

export type { WaitInputMediaKind };
