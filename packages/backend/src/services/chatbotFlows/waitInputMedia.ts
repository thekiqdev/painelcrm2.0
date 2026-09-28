/**
 * S32 — captura de mídia no wait_input (accept text|media|any).
 * Espelho em src/features/chatbot-flows/lib/waitInputMedia.ts
 */

export type WaitInputAccept = 'text' | 'media' | 'any';

export type WaitInputMediaKind = 'document' | 'image' | 'audio' | 'video';

export type InboundMediaItem = {
  type?: string | null;
  url?: string | null;
  mimetype?: string | null;
  mime?: string | null;
  fileName?: string | null;
  filename?: string | null;
  /** S32.1 — preenchido após cópia temp. */
  assetId?: string | null;
  asset_id?: string | null;
};

export type CapturedMediaVars = {
  url: string;
  nome: string;
  tipo: string;
  kind: WaitInputMediaKind;
  /** S32.1 — id interno em media_assets (scope flow_inbound_temp). */
  asset_id?: string | null;
};

const MEDIA_KINDS = new Set<WaitInputMediaKind>(['document', 'image', 'audio', 'video']);

const DEFAULT_MEDIA_KINDS: WaitInputMediaKind[] = ['document', 'image'];

export function readWaitInputAccept(data: Record<string, unknown> | null | undefined): WaitInputAccept {
  const raw = String(data?.accept || 'text').trim().toLowerCase();
  if (raw === 'media' || raw === 'any') return raw;
  return 'text';
}

export function readWaitInputMediaKinds(
  data: Record<string, unknown> | null | undefined
): WaitInputMediaKind[] {
  const raw = data?.media_kinds;
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_MEDIA_KINDS];
  const out: WaitInputMediaKind[] = [];
  for (const item of raw) {
    const k = String(item || '').trim().toLowerCase() as WaitInputMediaKind;
    if (MEDIA_KINDS.has(k) && !out.includes(k)) out.push(k);
  }
  return out.length ? out : [...DEFAULT_MEDIA_KINDS];
}

function normalizeKind(type: string | null | undefined): WaitInputMediaKind | null {
  const t = String(type || '')
    .trim()
    .toLowerCase();
  if (t === 'document' || t === 'doc' || t === 'file' || t === 'pdf') return 'document';
  if (t === 'image' || t === 'img' || t === 'sticker') return 'image';
  if (t === 'audio' || t === 'ptt' || t === 'voice') return 'audio';
  if (t === 'video') return 'video';
  return null;
}

function guessKindFromMime(mime: string | null | undefined): WaitInputMediaKind | null {
  const m = String(mime || '')
    .trim()
    .toLowerCase();
  if (!m) return null;
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (
    m === 'application/pdf' ||
    m.includes('document') ||
    m.includes('msword') ||
    m.includes('officedocument') ||
    m.includes('spreadsheet') ||
    m.includes('text/')
  ) {
    return 'document';
  }
  return 'document';
}

/** Extrai a primeira mídia válida (URL) que casa com media_kinds. */
export function pickInboundMedia(
  items: InboundMediaItem[] | null | undefined,
  allowedKinds: WaitInputMediaKind[]
): CapturedMediaVars | null {
  if (!items || items.length === 0) return null;
  const allowed = new Set(allowedKinds);
  for (const item of items) {
    const url = String(item?.url || '').trim();
    if (!url) continue;
    const mime =
      (typeof item.mimetype === 'string' && item.mimetype.trim()) ||
      (typeof item.mime === 'string' && item.mime.trim()) ||
      '';
    const kind = normalizeKind(item.type) || guessKindFromMime(mime);
    if (!kind || !allowed.has(kind)) continue;
    const nomeRaw =
      (typeof item.fileName === 'string' && item.fileName.trim()) ||
      (typeof item.filename === 'string' && item.filename.trim()) ||
      '';
    const nome = nomeRaw || defaultNameForKind(kind, mime);
    const tipo = mime || defaultMimeForKind(kind);
    const assetId =
      (typeof item.assetId === 'string' && item.assetId.trim()) ||
      (typeof item.asset_id === 'string' && item.asset_id.trim()) ||
      null;
    return { url, nome, tipo, kind, asset_id: assetId };
  }
  return null;
}

function defaultNameForKind(kind: WaitInputMediaKind, mime: string): string {
  if (kind === 'document') {
    if (mime.toLowerCase().includes('pdf')) return 'documento.pdf';
    return 'documento';
  }
  if (kind === 'image') return 'imagem.jpg';
  if (kind === 'audio') return 'audio.ogg';
  return 'video.mp4';
}

function defaultMimeForKind(kind: WaitInputMediaKind): string {
  if (kind === 'document') return 'application/pdf';
  if (kind === 'image') return 'image/jpeg';
  if (kind === 'audio') return 'audio/ogg';
  return 'video/mp4';
}

/**
 * Grava objeto sob `saveAs` + chaves flat `saveAs.url|nome|tipo` (D32.3).
 * O interpolador usa chaves flat (`{{arquivo.url}}`).
 * S32.1: opcionalmente `asset_id` / `saveAs.asset_id`.
 */
export function applyCapturedMediaVariables(
  variables: Record<string, unknown>,
  saveAs: string,
  media: CapturedMediaVars
): void {
  const name = String(saveAs || '').trim() || 'arquivo';
  const obj: Record<string, unknown> = { url: media.url, nome: media.nome, tipo: media.tipo };
  if (media.asset_id) obj.asset_id = media.asset_id;
  variables[name] = obj;
  variables[`${name}.url`] = media.url;
  variables[`${name}.nome`] = media.nome;
  variables[`${name}.tipo`] = media.tipo;
  if (media.asset_id) variables[`${name}.asset_id`] = media.asset_id;
}

export type WaitInputCaptureDecision =
  | { ok: true; mode: 'text'; value: string }
  | { ok: true; mode: 'media'; media: CapturedMediaVars }
  | { ok: false; reason: 'need_media' | 'need_text' | 'media_kind' };

/**
 * Decide se o inbound avança o wait_input.
 * Prioridade em `any`: mídia válida > texto (documentado S32).
 */
export function decideWaitInputCapture(opts: {
  accept: WaitInputAccept;
  mediaKinds: WaitInputMediaKind[];
  messageBody: string | null | undefined;
  interactiveReplyId?: string | null;
  inboundMedia?: InboundMediaItem[] | null;
}): WaitInputCaptureDecision {
  const text = String(opts.interactiveReplyId || opts.messageBody || '').trim();
  const media = pickInboundMedia(opts.inboundMedia, opts.mediaKinds);

  if (opts.accept === 'text') {
    return { ok: true, mode: 'text', value: text };
  }

  if (opts.accept === 'media') {
    if (media) return { ok: true, mode: 'media', media };
    if (opts.inboundMedia && opts.inboundMedia.some((m) => String(m?.url || '').trim())) {
      return { ok: false, reason: 'media_kind' };
    }
    return { ok: false, reason: 'need_media' };
  }

  // any
  if (media) return { ok: true, mode: 'media', media };
  if (text) return { ok: true, mode: 'text', value: text };
  return { ok: false, reason: 'need_text' };
}

export function defaultWaitInputRejectMessage(
  reason: 'need_media' | 'need_text' | 'media_kind'
): string {
  if (reason === 'need_media' || reason === 'media_kind') {
    return 'Por favor, envie um arquivo (documento ou imagem).';
  }
  return 'Por favor, envie uma mensagem de texto ou um arquivo.';
}
