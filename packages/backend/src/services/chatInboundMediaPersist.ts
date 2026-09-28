/**
 * Sprint 1 — ingestão de mídia inbound do chat para storage nosso (`chat_attachment`).
 * UI e flows passam a ver `/api/media/v1/raw?...` em vez de URL UazAPI/CDN.
 */
import { MEDIA_RAW_SIGNED_PATH } from './media/mediaUrlSigner.js';
import { cacheRemoteUrl, saveFromBuffer } from './media/mediaService.js';
import { getMediaMaxFileBytes } from './media/mediaConfig.js';
import {
  isOurSignedMediaUrl,
  isRealInboundMediaFileUrl,
  type ChatMediaItem,
  type ChatMessageKind,
} from '../utils/chatMessageContract.js';

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

function toRelativeMediaUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (t.startsWith('/')) return t;
  try {
    const u = new URL(t);
    if (u.pathname.includes(MEDIA_RAW_SIGNED_PATH)) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return t;
}

async function persistRemoteHttpUrl(opts: {
  tenantId: string;
  conversationId: string;
  sourceUrl: string;
  mimeHint?: string | null;
  originalFilename?: string | null;
  kind?: ChatMessageKind | null;
}): Promise<{ ok: true; relativeUrl: string; mimeType: string } | { ok: false; reason: string }> {
  const cached = await cacheRemoteUrl({
    tenantId: opts.tenantId,
    ownerType: 'conversation',
    ownerId: opts.conversationId,
    scope: 'chat_attachment',
    sourceUrl: opts.sourceUrl,
    writeAssetRecord: true,
    metadata: {
      purpose: 'chat_inbound',
      kind: opts.kind || null,
      original_filename: opts.originalFilename || null,
    },
    fetchInit: {
      headers: {
        'User-Agent': 'PainelCRM-ChatInbound/1.0',
        Accept: '*/*',
      },
    },
  });

  if (cached.ok && cached.relativeUrl) {
    return {
      ok: true,
      relativeUrl: cached.relativeUrl,
      mimeType: String(opts.mimeHint || 'application/octet-stream'),
    };
  }

  // Fallback: download manual + inferência PDF (cacheRemoteUrl só infere imagem em octet-stream)
  const reason = cached.reason || 'cache_failed';
  if (reason !== 'remote_bad_mime' && reason !== 'remote_empty') {
    return { ok: false, reason };
  }

  try {
    const max = getMediaMaxFileBytes();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(opts.sourceUrl, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'PainelCRM-ChatInbound/1.0',
          Accept: '*/*',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return { ok: false, reason: `remote_http_${res.status}` };
    const raw = Buffer.from(await res.arrayBuffer());
    if (!raw.length) return { ok: false, reason: 'remote_empty' };
    if (raw.length > max) return { ok: false, reason: 'remote_too_large' };

    let mimeType = String(res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = inferMimeFromBuffer(
        raw,
        String(opts.mimeHint || '').trim().toLowerCase() || 'application/pdf'
      );
    }
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

    const saved = await saveFromBuffer({
      tenantId: opts.tenantId,
      ownerType: 'conversation',
      ownerId: opts.conversationId,
      scope: 'chat_attachment',
      buffer: raw,
      mimeType,
      originalFilename: opts.originalFilename || null,
      sourceUrl: opts.sourceUrl,
      writeAssetRecord: true,
      metadata: {
        purpose: 'chat_inbound',
        kind: opts.kind || null,
        original_filename: opts.originalFilename || null,
      },
    });
    return { ok: true, relativeUrl: saved.relativeUrl, mimeType: saved.mimeType };
  } catch (e: unknown) {
    return { ok: false, reason: e instanceof Error ? e.message : 'persist_failed' };
  }
}

/**
 * Reescreve URLs remotas (UazAPI/CDN) para URL assinada nossa.
 * Mantém stubs `data:` / sem URL; normaliza URLs já nossas para path relativo.
 */
export async function rehostChatInboundMediaItems(opts: {
  tenantId: string;
  conversationId: string;
  items: ChatMediaItem[];
}): Promise<ChatMediaItem[]> {
  const tenantId = String(opts.tenantId || '').trim();
  const conversationId = String(opts.conversationId || '').trim();
  if (!tenantId || !conversationId || !opts.items.length) return opts.items;

  const out: ChatMediaItem[] = [];
  for (const item of opts.items) {
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url) {
      out.push(item);
      continue;
    }

    if (isOurSignedMediaUrl(url)) {
      out.push({
        ...item,
        url: toRelativeMediaUrl(url),
        persistentStub: undefined,
      });
      continue;
    }

    if (!isRealInboundMediaFileUrl(url, item.type)) {
      out.push(item);
      continue;
    }

    if (!/^https?:\/\//i.test(url)) {
      out.push(item);
      continue;
    }

    const persisted = await persistRemoteHttpUrl({
      tenantId,
      conversationId,
      sourceUrl: url,
      mimeHint: item.mimetype,
      originalFilename: item.fileName,
      kind: item.type,
    });

    if (persisted.ok) {
      out.push({
        ...item,
        url: persisted.relativeUrl,
        mimetype: item.mimetype || persisted.mimeType || null,
        persistentStub: undefined,
      });
      console.log(
        JSON.stringify({
          event: 'chat_inbound_media',
          phase: 'rehosted',
          conversationId,
          kind: item.type,
          storagePath: MEDIA_RAW_SIGNED_PATH,
        })
      );
    } else {
      console.warn(
        JSON.stringify({
          event: 'chat_inbound_media',
          phase: 'rehost_failed',
          conversationId,
          kind: item.type,
          reason: persisted.reason,
        })
      );
      // Não persistir host do provedor na UI: stub sem URL (metadados preservados).
      out.push({
        ...item,
        url: null,
        persistentStub: true,
      });
    }
  }
  return out;
}
