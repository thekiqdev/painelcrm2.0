/**
 * Contrato único de mensagem (Etapa 2 — texto + mídia) para backend e frontend.
 * Persistido em `chat_messages.metadata.message_contract` e espelhado na API.
 */

export type ChatMessageKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'unknown';

export interface ChatMediaItem {
  type: ChatMessageKind;
  url?: string | null;
  mimetype?: string | null;
  fileName?: string | null;
  seconds?: number | null;
  /**
   * Quando true, o item persiste mesmo sem URL (stub após falha de download ou só metadados remotos).
   */
  persistentStub?: boolean;
}

/** Contrato estável para UI e integrações */
export interface ChatMessageContract {
  kind: ChatMessageKind;
  /** Texto principal (mensagem de texto) ou legenda quando kind !== text */
  body: string | null;
  /** Legenda explícita (redundante com body para imagem quando só há legenda) */
  caption: string | null;
  direction: 'incoming' | 'outgoing';
  media: ChatMediaItem[];
  external_message_id?: string | null;
  status?: string | null;
}

/**
 * Garante texto plano para coluna `body` / contrato (evita gravar objeto e exibir "[object Object]").
 */
export function ensurePlainString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.body === 'string' && o.body.trim()) return o.body.trim();
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
    if (typeof o.caption === 'string' && o.caption.trim()) return o.caption.trim();
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    const nested = o.text;
    if (nested && typeof nested === 'object') {
      const t = nested as Record<string, unknown>;
      if (typeof t.body === 'string' && t.body.trim()) return t.body.trim();
    }
  }
  return '';
}

/** Extrai URL string de payloads Uaz/WhatsApp (url pode vir aninhada ou como objeto). */
export function resolveMediaUrlFromUnknown(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of [
      'url',
      'href',
      'mediaUrl',
      'fileURL',
      'fileUrl',
      'directPath',
      'downloadUrl',
      'link',
      'src',
    ]) {
      const x = o[k];
      const s = resolveMediaUrlFromUnknown(x);
      if (s) return s;
    }
  }
  return null;
}

export function sanitizeMediaItemsForDb(items: ChatMediaItem[]): ChatMediaItem[] {
  return items
    .map((m) => {
      const ext = m as ChatMediaItem & { mime?: unknown };
      const mime =
        typeof m.mimetype === 'string'
          ? m.mimetype
          : typeof ext.mime === 'string'
            ? ext.mime
            : null;
      return {
        ...m,
        url: resolveMediaUrlFromUnknown(m.url) ?? null,
        mimetype: mime,
      };
    })
    .filter((m) => {
      const stub = (m as ChatMediaItem & { persistentStub?: boolean }).persistentStub;
      if (stub === true) {
        const t = m.type;
        return (
          t === 'image' ||
          t === 'video' ||
          t === 'audio' ||
          t === 'document' ||
          t === 'sticker'
        );
      }
      return typeof m.url === 'string' && m.url.length > 0;
    });
}

function asMediaArray(raw: unknown): ChatMediaItem[] {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return asMediaArray(p);
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw
      .map((m: any) => ({
        type: (m?.type as ChatMessageKind) || 'unknown',
        url: resolveMediaUrlFromUnknown(m?.url) ?? resolveMediaUrlFromUnknown(m) ?? null,
        mimetype: m?.mimetype ?? m?.mime ?? null,
        fileName: m?.fileName ?? m?.filename ?? null,
        seconds: typeof m?.seconds === 'number' ? m.seconds : null,
        persistentStub: m?.persistentStub === true,
      }))
      .filter((m) => {
        if (m.persistentStub === true) {
          const t = m.type;
          return (
            t === 'image' ||
            t === 'video' ||
            t === 'audio' ||
            t === 'document' ||
            t === 'sticker'
          );
        }
        return typeof m.url === 'string' && m.url.length > 0;
      });
  }
  return [];
}

/**
 * Webhook/sync: o envelope traz `fileURL`, `messageType`, `id`, `fromMe` no pai e o proto Baileys em `message`.
 * Usar só `data.message` descarta a URL e quebra mídia recebida.
 */
export function mergeMessageEnvelope(entry: any): any {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const inner = (entry as Record<string, unknown>).message;
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    const { message: _drop, ...rest } = entry as Record<string, unknown>;
    return { ...(inner as Record<string, unknown>), ...rest };
  }
  return entry;
}

/** ID aceito por `/message/download` (UazAPI). */
export function extractUazDownloadMessageId(message: any): string | null {
  if (!message || typeof message !== 'object') return null;
  const key = message.key as Record<string, unknown> | undefined;
  const keyId =
    key && key.id != null && String(key.id).trim() ? String(key.id).trim() : '';
  const candidates = [message.id, message.messageId, message.messageid, keyId || null];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return null;
}

/**
 * Uaz costuma devolver id `5511999999999:3EB0...`; o download muitas vezes espera só o sufixo hex após `:`.
 */
export function normalizeIdForUazDownload(raw: string): string {
  const s = raw.trim();
  const idx = s.lastIndexOf(':');
  if (idx <= 0 || idx >= s.length - 1) return s;
  const left = s.slice(0, idx);
  const right = s.slice(idx + 1).trim();
  const digits = left.replace(/\D/g, '');
  if (
    digits.length >= 10 &&
    digits.length <= 16 &&
    /^[A-F0-9]{8,40}$/i.test(right)
  ) {
    return right;
  }
  return s;
}

function readLooseMessageTypeField(m: Record<string, unknown>): string | null {
  const lower = Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const name of ['messagetype', 'msgtype', 'type', 'mediatype', 'contenttype']) {
    const v = lower[name];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Detecta imageMessage / ImageMessage / image_message no objeto já mesclado. */
function detectMediaProtoKindFromKeys(m: Record<string, unknown>): ChatMessageKind | null {
  for (const k of Object.keys(m)) {
    const norm = k.toLowerCase().replace(/_/g, '');
    const v = m[k];
    if (v == null) continue;
    if (norm === 'imagemessage') return 'image';
    if (norm === 'videomessage') return 'video';
    if (norm === 'audiomessage') return 'audio';
    if (norm === 'pttmessage') return 'audio';
    if (norm === 'documentmessage') return 'document';
    if (norm === 'stickermessage') return 'sticker';
  }
  return null;
}

/** Normaliza resposta de `POST /message/download` em itens de mídia persistíveis. */
export function mediaItemsFromDownloadPayload(dl: unknown, kind: ChatMessageKind): ChatMediaItem[] {
  if (!dl || typeof dl !== 'object') return [];
  const o = dl as Record<string, unknown>;
  const inner =
    o.data && typeof o.data === 'object' && !Array.isArray(o.data)
      ? (o.data as Record<string, unknown>)
      : null;
  const url =
    resolveMediaUrlFromUnknown(o.fileURL) ||
    resolveMediaUrlFromUnknown(o.fileUrl) ||
    resolveMediaUrlFromUnknown(o.url) ||
    (inner
      ? resolveMediaUrlFromUnknown(inner.fileURL) || resolveMediaUrlFromUnknown(inner.fileUrl)
      : null);
  const mimetype =
    (typeof o.mimetype === 'string' && o.mimetype) ||
    (typeof o.mimeType === 'string' && o.mimeType) ||
    (inner && typeof inner.mimetype === 'string' && inner.mimetype) ||
    null;
  if (!url || !String(url).trim()) return [];
  const t: ChatMessageKind = kind === 'unknown' ? 'image' : kind;
  return [{ type: t, url: String(url).trim(), mimetype }];
}

/**
 * Modelo Message da UazAPI (OpenAPI): `fileURL`, `messageType`, `content` (JSON com nós estilo Baileys).
 * Unifica com payloads `message: { imageMessage }` para extração de corpo/mídia.
 */
export function canonicalMessageForExtraction(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  let m: Record<string, unknown> = { ...raw };

  if (typeof m.content === 'string' && m.content.trim()) {
    try {
      const parsed = JSON.parse(m.content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        m = { ...(parsed as Record<string, unknown>), ...m };
      }
    } catch {
      /* content não é JSON */
    }
  } else if (m.content && typeof m.content === 'object' && !Array.isArray(m.content)) {
    m = { ...(m.content as Record<string, unknown>), ...m };
  }

  const inner = m.message;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const nest = inner as Record<string, unknown>;
    const hasMediaProto =
      nest.imageMessage ||
      nest.videoMessage ||
      nest.audioMessage ||
      nest.documentMessage ||
      nest.stickerMessage ||
      nest.pttMessage;
    if (hasMediaProto) {
      m = { ...nest, ...m };
    }
  }

  return m;
}

function parseEmbeddedMessageContract(meta: Record<string, unknown>): ChatMessageContract | undefined {
  const raw = meta.message_contract;
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ChatMessageContract;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object') return raw as ChatMessageContract;
  return undefined;
}

/** Corpo legível + legenda a partir do payload bruto (UazAPI / Baileys-like) */
export function extractMessageBody(message: any): string {
  const m = canonicalMessageForExtraction(message);
  if (!m || typeof m !== 'object') return '';
  if (typeof m.conversation === 'string' && m.conversation.trim()) return m.conversation.trim();
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();
  if (m.text && typeof m.text === 'object') {
    const t = ensurePlainString(m.text);
    if (t) return t;
  }
  const fromBody = ensurePlainString(m.body);
  if (fromBody) return fromBody;
  const fromCaption = ensurePlainString(m.caption);
  if (fromCaption) return fromCaption;

  const im = m.imageMessage || m.image?.message || m.image;
  if (im?.caption != null) {
    const c = ensurePlainString(im.caption);
    if (c) return c;
  }
  const vm = m.videoMessage || m.video;
  if (vm?.caption != null) {
    const c = ensurePlainString(vm.caption);
    if (c) return c;
  }

  if (typeof m.notify === 'string' && m.notify.trim()) return m.notify.trim();
  if (m.content != null && typeof m.content !== 'object') {
    const c = ensurePlainString(m.content);
    if (c) return c;
  }

  if (m.type === 'location') {
    return `📍 Localização: ${m.latitude}, ${m.longitude}`;
  }
  if (m.type === 'contact') {
    return `👤 Contato: ${m.displayName || m.name || 'Contato compartilhado'}`;
  }
  if (m.type === 'document') {
    const name = ensurePlainString(m.fileName) || 'Documento';
    return `📄 ${name}`;
  }
  const mt = m.messageType || m.type;
  if (mt === 'image' || mt === 'imageMessage' || mt === 'ephemeralImage' || mt === 'albumMessage') {
    return ensurePlainString(m.caption) || '🖼️ Imagem';
  }
  if (mt === 'video' || mt === 'videoMessage') {
    return ensurePlainString(m.caption) || '🎥 Vídeo';
  }
  if (mt === 'audio' || mt === 'audioMessage' || mt === 'ptt' || mt === 'pttMessage') {
    return '🎵 Áudio';
  }
  if (mt === 'sticker' || mt === 'stickerMessage') {
    return '🎨 Sticker';
  }

  return '';
}

/**
 * ID da opção em reply de botão/lista UazAPI (S13).
 * Preferir sobre o texto quando o flow faz match por option.id.
 */
export function extractInteractiveReplyId(message: any): string {
  const m = canonicalMessageForExtraction(message);
  if (!m || typeof m !== 'object') return '';
  const candidates = [
    m.buttonOrListid,
    m.buttonOrListId,
    m.selectedId,
    m.selectedRowId,
    (m.listResponse as { singleSelectReply?: { selectedRowId?: string } } | undefined)
      ?.singleSelectReply?.selectedRowId,
    (m.buttonsResponseMessage as { selectedButtonId?: string } | undefined)?.selectedButtonId,
    (m.templateButtonReplyMessage as { selectedId?: string } | undefined)?.selectedId,
  ];
  for (const c of candidates) {
    const s = ensurePlainString(c);
    if (s) return s;
  }
  // Também procura no metadata aninhado (saveMessage).
  const meta = (m as { metadata?: unknown }).metadata;
  if (meta && typeof meta === 'object') {
    const nested = extractInteractiveReplyId(meta);
    if (nested) return nested;
  }
  return '';
}

/** Extrai caption quando é só mídia (para message_contract.caption) */
export function extractCaption(message: any): string | null {
  if (!message || typeof message !== 'object') return null;
  if (typeof message.caption === 'string' && message.caption.trim()) return message.caption.trim();
  const im = message.imageMessage || message.image?.message;
  if (im?.caption && String(im.caption).trim()) return String(im.caption).trim();
  const vm = message.videoMessage;
  if (vm?.caption && String(vm.caption).trim()) return String(vm.caption).trim();
  return null;
}

/**
 * Monta lista de mídia a partir do payload UazAPI (objeto message ou wrapper).
 */
function resolvePartMediaUrl(part: unknown): string | null {
  if (part == null) return null;
  if (typeof part === 'string') return resolveMediaUrlFromUnknown(part);
  if (typeof part !== 'object') return null;
  const o = part as Record<string, unknown>;
  return (
    resolveMediaUrlFromUnknown(o.url) ||
    resolveMediaUrlFromUnknown(o.directPath) ||
    resolveMediaUrlFromUnknown(o.mediaUrl) ||
    resolveMediaUrlFromUnknown(part)
  );
}

/** Miniatura JPEG do proto Baileys → data URL exibível na UI sem depender de `/message/download`. */
function jpegBytesToDataUrl(jpegThumb: unknown): string | null {
  if (jpegThumb == null) return null;
  if (typeof jpegThumb === 'string') {
    const t = jpegThumb.trim();
    if (!t) return null;
    if (t.startsWith('data:')) return t;
    return `data:image/jpeg;base64,${t}`;
  }
  try {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(jpegThumb)) {
      return `data:image/jpeg;base64,${(jpegThumb as Buffer).toString('base64')}`;
    }
  } catch {
    /* Buffer indisponível */
  }
  if (jpegThumb instanceof Uint8Array) {
    return `data:image/jpeg;base64,${Buffer.from(jpegThumb).toString('base64')}`;
  }
  return null;
}

function defaultMimetypeForKind(kind: ChatMessageKind): string | null {
  switch (kind) {
    case 'image':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/ogg; codecs=opus';
    case 'document':
      return 'application/octet-stream';
    case 'sticker':
      return 'image/webp';
    default:
      return null;
  }
}

/**
 * Fallback quando `extractMediaInfo` não achou URL: persiste stub (thumbnail JPEG ou só metadados)
 * para manter `hasMedia`/contrato coerente mesmo se o download falhar.
 */
export function buildPersistentMediaStubForKind(
  message: any,
  kind: ChatMessageKind
): ChatMediaItem[] {
  if (kind === 'text' || kind === 'unknown') return [];
  const m = canonicalMessageForExtraction(message);
  if (!m || typeof m !== 'object') {
    return [
      {
        type: kind,
        url: null,
        mimetype: defaultMimetypeForKind(kind),
        persistentStub: true,
      },
    ];
  }
  const mr = m as Record<string, unknown>;

  const thumbFrom = (part: unknown): string | null => {
    if (!part || typeof part !== 'object') return null;
    return jpegBytesToDataUrl((part as Record<string, unknown>).jpegThumbnail);
  };

  if (kind === 'image' && mr.imageMessage) {
    const imRec = mr.imageMessage as Record<string, unknown>;
    const th = thumbFrom(mr.imageMessage);
    if (th) {
      const mime = typeof imRec.mimetype === 'string' ? imRec.mimetype : 'image/jpeg';
      return [
        {
          type: 'image',
          url: th,
          mimetype: mime,
          persistentStub: true,
        },
      ];
    }
  }
  if (kind === 'video' && mr.videoMessage) {
    const vm = mr.videoMessage as Record<string, unknown>;
    const th = thumbFrom(vm);
    if (th) {
      return [
        {
          type: 'video',
          url: th,
          mimetype: (typeof vm.mimetype === 'string' && vm.mimetype) || 'video/mp4',
          seconds: typeof vm.seconds === 'number' ? vm.seconds : null,
          persistentStub: true,
        },
      ];
    }
  }
  if (kind === 'sticker' && mr.stickerMessage) {
    const sm = mr.stickerMessage as Record<string, unknown>;
    const th = thumbFrom(sm);
    const url = resolvePartMediaUrl(sm);
    if (url) {
      return [{ type: 'sticker', url, mimetype: (typeof sm.mimetype === 'string' && sm.mimetype) || 'image/webp' }];
    }
    if (th) {
      return [
        {
          type: 'sticker',
          url: th,
          mimetype: (typeof sm.mimetype === 'string' && sm.mimetype) || 'image/webp',
          persistentStub: true,
        },
      ];
    }
  }
  if (kind === 'document' && mr.documentMessage) {
    const dm = mr.documentMessage as Record<string, unknown>;
    const th = thumbFrom(dm);
    if (th) {
      return [
        {
          type: 'document',
          url: th,
          mimetype: (typeof dm.mimetype === 'string' && dm.mimetype) || 'application/octet-stream',
          fileName:
            (typeof dm.fileName === 'string' && dm.fileName) ||
            (typeof dm.title === 'string' && dm.title) ||
            null,
          persistentStub: true,
        },
      ];
    }
  }
  if (kind === 'audio') {
    const am = (mr.audioMessage || mr.pttMessage) as Record<string, unknown> | undefined;
    if (am && typeof am === 'object') {
      return [
        {
          type: 'audio',
          url: null,
          mimetype: (typeof am.mimetype === 'string' && am.mimetype) || 'audio/ogg; codecs=opus',
          seconds: typeof am.seconds === 'number' ? am.seconds : null,
          persistentStub: true,
        },
      ];
    }
  }

  return [
    {
      type: kind,
      url: null,
      mimetype: defaultMimetypeForKind(kind),
      persistentStub: true,
    },
  ];
}

function mapUazMessageTypeToKind(mt: unknown): ChatMessageKind {
  const s = String(mt || 'image')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
  if (s === 'video' || s === 'videomessage') return 'video';
  if (s === 'audio' || s === 'audiomessage' || s === 'ptt' || s === 'pttmessage') return 'audio';
  if (s === 'document' || s === 'documentmessage') return 'document';
  if (s === 'sticker' || s === 'stickermessage') return 'sticker';
  if (s === 'image' || s === 'imagemessage' || s === 'ephemeralimage' || s === 'albummessage') return 'image';
  return 'image';
}

export function extractMediaInfo(message: any): ChatMediaItem[] {
  const media: ChatMediaItem[] = [];
  const m = canonicalMessageForExtraction(message);

  if (!m || typeof m !== 'object') return media;

  if (Array.isArray(m.media)) {
    return asMediaArray(m.media);
  }

  const topMediaUrl =
    resolveMediaUrlFromUnknown(m.mediaUrl) ||
    resolveMediaUrlFromUnknown(m.fileURL) ||
    resolveMediaUrlFromUnknown(m.fileUrl);
  if (topMediaUrl) {
    const hint = readLooseMessageTypeField(m as Record<string, unknown>) || m.messageType || m.type;
    media.push({
      type: mapUazMessageTypeToKind(hint),
      url: topMediaUrl,
      mimetype:
        (typeof m.mimetype === 'string' && m.mimetype) ||
        (typeof m.mime === 'string' && m.mime) ||
        null,
    });
    return media;
  }

  if (m.imageMessage) {
    const im = m.imageMessage;
    const url = resolvePartMediaUrl(im);
    if (url) {
      media.push({
        type: 'image',
        url,
        mimetype: (typeof im.mimetype === 'string' && im.mimetype) || 'image/jpeg',
        fileName: (typeof im.fileName === 'string' && im.fileName) || null,
      });
      return media;
    }
    const thumb = jpegBytesToDataUrl(im.jpegThumbnail);
    if (thumb) {
      media.push({
        type: 'image',
        url: thumb,
        mimetype: (typeof im.mimetype === 'string' && im.mimetype) || 'image/jpeg',
        fileName: (typeof im.fileName === 'string' && im.fileName) || null,
        persistentStub: true,
      });
      return media;
    }
  }
  if (m.videoMessage) {
    const vm = m.videoMessage;
    const url = resolvePartMediaUrl(vm);
    if (url) {
      media.push({
        type: 'video',
        url,
        mimetype: (typeof vm.mimetype === 'string' && vm.mimetype) || 'video/mp4',
        seconds: typeof vm.seconds === 'number' ? vm.seconds : null,
      });
      return media;
    }
    const thumb = jpegBytesToDataUrl(vm.jpegThumbnail);
    if (thumb) {
      media.push({
        type: 'video',
        url: thumb,
        mimetype: (typeof vm.mimetype === 'string' && vm.mimetype) || 'video/mp4',
        seconds: typeof vm.seconds === 'number' ? vm.seconds : null,
        persistentStub: true,
      });
      return media;
    }
  }
  if (m.audioMessage) {
    const am = m.audioMessage;
    const url = resolvePartMediaUrl(am);
    if (url) {
      media.push({
        type: 'audio',
        url,
        mimetype: (typeof am.mimetype === 'string' && am.mimetype) || 'audio/ogg',
        seconds: typeof am.seconds === 'number' ? am.seconds : null,
      });
      return media;
    }
    media.push({
      type: 'audio',
      url: null,
      mimetype: (typeof am.mimetype === 'string' && am.mimetype) || 'audio/ogg; codecs=opus',
      seconds: typeof am.seconds === 'number' ? am.seconds : null,
      persistentStub: true,
    });
    return media;
  }
  if (m.pttMessage) {
    const pm = m.pttMessage;
    const url = resolvePartMediaUrl(pm);
    if (url) {
      media.push({
        type: 'audio',
        url,
        mimetype: (typeof pm.mimetype === 'string' && pm.mimetype) || 'audio/ogg',
        seconds: typeof pm.seconds === 'number' ? pm.seconds : null,
      });
      return media;
    }
    media.push({
      type: 'audio',
      url: null,
      mimetype: (typeof pm.mimetype === 'string' && pm.mimetype) || 'audio/ogg; codecs=opus',
      seconds: typeof pm.seconds === 'number' ? pm.seconds : null,
      persistentStub: true,
    });
    return media;
  }
  if (m.documentMessage) {
    const dm = m.documentMessage;
    const url = resolvePartMediaUrl(dm);
    if (url) {
      media.push({
        type: 'document',
        url,
        mimetype: typeof dm.mimetype === 'string' ? dm.mimetype : null,
        fileName:
          (typeof dm.fileName === 'string' && dm.fileName) ||
          (typeof dm.title === 'string' && dm.title) ||
          null,
      });
      return media;
    }
    const thumb = jpegBytesToDataUrl(dm.jpegThumbnail);
    if (thumb) {
      media.push({
        type: 'document',
        url: thumb,
        mimetype: typeof dm.mimetype === 'string' ? dm.mimetype : 'application/octet-stream',
        fileName:
          (typeof dm.fileName === 'string' && dm.fileName) ||
          (typeof dm.title === 'string' && dm.title) ||
          null,
        persistentStub: true,
      });
      return media;
    }
  }
  if (m.stickerMessage) {
    const sm = m.stickerMessage;
    const url = resolvePartMediaUrl(sm);
    if (url) {
      media.push({
        type: 'sticker',
        url,
        mimetype: (typeof sm.mimetype === 'string' && sm.mimetype) || 'image/webp',
      });
      return media;
    }
    const thumb = jpegBytesToDataUrl(sm.jpegThumbnail);
    if (thumb) {
      media.push({
        type: 'sticker',
        url: thumb,
        mimetype: (typeof sm.mimetype === 'string' && sm.mimetype) || 'image/webp',
        persistentStub: true,
      });
      return media;
    }
  }

  if (m.image || m.video || m.audio || m.document || m.sticker) {
    const mediaItem: ChatMediaItem = { type: 'unknown' };

    if (m.image) {
      mediaItem.type = 'image';
      const img = m.image;
      mediaItem.url = typeof img === 'string' ? resolveMediaUrlFromUnknown(img) : resolvePartMediaUrl(img);
      const imgRec = typeof img === 'object' && img !== null ? (img as Record<string, unknown>) : null;
      mediaItem.mimetype =
        typeof imgRec?.mimetype === 'string' ? imgRec.mimetype : 'image/jpeg';
    } else if (m.video) {
      mediaItem.type = 'video';
      const v = m.video;
      mediaItem.url = typeof v === 'string' ? resolveMediaUrlFromUnknown(v) : resolvePartMediaUrl(v);
      const vRec = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
      mediaItem.mimetype =
        typeof vRec?.mimetype === 'string' ? vRec.mimetype : 'video/mp4';
    } else if (m.audio) {
      mediaItem.type = 'audio';
      const a = m.audio;
      mediaItem.url = typeof a === 'string' ? resolveMediaUrlFromUnknown(a) : resolvePartMediaUrl(a);
      const aRec = typeof a === 'object' && a !== null ? (a as Record<string, unknown>) : null;
      mediaItem.mimetype =
        typeof aRec?.mimetype === 'string' ? aRec.mimetype : 'audio/ogg';
      mediaItem.seconds =
        typeof aRec?.seconds === 'number' ? aRec.seconds : null;
    } else if (m.document) {
      mediaItem.type = 'document';
      const d = m.document;
      mediaItem.url = typeof d === 'string' ? resolveMediaUrlFromUnknown(d) : resolvePartMediaUrl(d);
      const dRec = typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : null;
      mediaItem.mimetype = typeof dRec?.mimetype === 'string' ? dRec.mimetype : null;
      mediaItem.fileName = typeof dRec?.fileName === 'string' ? dRec.fileName : null;
    } else if (m.sticker) {
      mediaItem.type = 'sticker';
      const s = m.sticker;
      mediaItem.url = typeof s === 'string' ? resolveMediaUrlFromUnknown(s) : resolvePartMediaUrl(s);
      const sRec = typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : null;
      mediaItem.mimetype =
        typeof sRec?.mimetype === 'string' ? sRec.mimetype : 'image/webp';
    }

    if (mediaItem.url) {
      media.push(mediaItem);
    }
  }

  return media;
}

export function inferMessageTypeFromPayload(message: any): ChatMessageKind {
  const m = canonicalMessageForExtraction(message);
  if (!m || typeof m !== 'object') return 'unknown';
  const mr = m as Record<string, unknown>;

  const fromProto = detectMediaProtoKindFromKeys(mr);
  if (fromProto) return fromProto;

  const loose = readLooseMessageTypeField(mr);
  const tRaw =
    loose ||
    mr.type ||
    mr.messageType ||
    mr.msgType ||
    (mr.text || mr.body ? 'text' : null) ||
    (mr.image || mr.imageMessage ? 'image' : null) ||
    (mr.video || mr.videoMessage ? 'video' : null) ||
    (mr.audio || mr.audioMessage || mr.pttMessage ? 'audio' : null) ||
    (mr.document || mr.documentMessage ? 'document' : null) ||
    (mr.sticker || mr.stickerMessage ? 'sticker' : null);

  if (tRaw == null) return 'unknown';

  const t =
    typeof tRaw === 'string'
      ? tRaw.toLowerCase().replace(/\s+/g, '').replace(/_/g, '')
      : String(tRaw);

  if (t === 'chat' || t === 'text' || t === 'extendedtextmessage' || t === 'conversation') return 'text';
  if (t === 'image' || t === 'imagemessage' || t === 'ephemeralimage' || t === 'albummessage') return 'image';
  if (t === 'video' || t === 'videomessage') return 'video';
  if (t === 'audio' || t === 'audiomessage' || t === 'ptt' || t === 'pttmessage') return 'audio';
  if (t === 'document' || t === 'documentmessage') return 'document';
  if (t === 'sticker' || t === 'stickermessage') return 'sticker';
  if (t === 'location' || t === 'contact' || t === 'button' || t === 'list' || t === 'reaction')
    return 'unknown';
  return 'unknown';
}

export function buildMessageContract(params: {
  direction: 'incoming' | 'outgoing';
  body: string | null;
  media: ChatMediaItem[] | unknown;
  kindHint?: ChatMessageKind | null;
  externalMessageId?: string | null;
  status?: string | null;
}): ChatMessageContract {
  const mediaList = Array.isArray(params.media) ? asMediaArray(params.media) : [];
  const trimmedBody = ensurePlainString(params.body ?? '');
  const hasText = trimmedBody.length > 0;
  const hasMedia = mediaList.length > 0;

  let kind: ChatMessageKind = params.kindHint || 'unknown';
  if (kind === 'unknown') {
    if (hasMedia) {
      const t = mediaList[0]?.type;
      kind = t && t !== 'unknown' ? t : 'image';
    } else if (hasText) {
      kind = 'text';
    } else {
      kind = 'unknown';
    }
  } else if (hasMedia && kind === 'text') {
    const t = mediaList[0]?.type;
    if (t && t !== 'unknown') kind = t;
  }

  const caption = kind !== 'text' && hasText ? trimmedBody : null;
  const displayBody =
    kind === 'text' ? (hasText ? trimmedBody : null) : caption;

  return {
    kind,
    body: displayBody,
    caption,
    direction: params.direction,
    media: mediaList,
    external_message_id: params.externalMessageId ?? null,
    status: params.status ?? null,
  };
}

/** Enriquece metadata salvo com contrato (idempotente). */
export function attachContractToMetadata(
  metadata: Record<string, unknown> | null | undefined,
  contract: ChatMessageContract
): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  return {
    ...base,
    message_contract: contract as unknown as Record<string, unknown>,
  };
}

/** Deriva contrato a partir de uma linha do banco (GET mensagens / compat). */
export function contractFromDbRow(row: {
  body?: string | null;
  media?: unknown;
  metadata?: unknown;
  direction?: string;
  external_message_id?: string | null;
  status?: string | null;
}): ChatMessageContract {
  const meta = (row.metadata as Record<string, unknown>) || {};
  const rowMedia = asMediaArray(row.media);
  const existing = parseEmbeddedMessageContract(meta);

  /**
   * Coluna `chat_messages.media` é fonte de verdade para URL/base64; `metadata.message_contract`
   * pode estar desatualizado ou sem `media` (ex.: merge só do payload Uaz). Sempre preferir
   * `row.media` quando vier preenchida.
   */
  if (existing && existing.kind) {
    const media =
      rowMedia.length > 0
        ? rowMedia
        : Array.isArray(existing.media) && existing.media.length > 0
          ? asMediaArray(existing.media)
          : rowMedia;
    let kind: ChatMessageKind = existing.kind;
    if ((kind === 'unknown' || !kind) && media.length > 0) {
      const t = media[0]?.type;
      kind = t && t !== 'unknown' ? t : 'image';
    }
    return buildMessageContract({
      direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
      body: row.body ?? existing.body ?? null,
      media,
      kindHint: kind,
      externalMessageId: row.external_message_id ?? existing.external_message_id ?? null,
      status: row.status ?? existing.status ?? null,
    });
  }

  const hint = inferMessageTypeFromPayload(meta);
  return buildMessageContract({
    direction: row.direction === 'outgoing' ? 'outgoing' : 'incoming',
    body: row.body ?? null,
    media: rowMedia,
    kindHint: rowMedia.length ? (rowMedia[0].type as ChatMessageKind) : hint,
    externalMessageId: row.external_message_id ?? null,
    status: row.status ?? null,
  });
}
