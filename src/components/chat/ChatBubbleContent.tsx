import React, { useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { coerceChatPlainText, type ChatMessage } from '@/services/chat';
import { chatMediaDebugLog } from '@/lib/chatMediaDebug';

/** Texto da bolha: preserva quebras do remetente; quebra só por palavras / overflow normal (evita “uma letra por linha”). */
const CHAT_MSG_TEXT =
  'min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:break-word] [word-break:normal]';

/** Primeira URL de mídia utilizável (imagem, áudio, etc.), inclusive objeto aninhado. */
function firstRenderableMediaUrl(message: ChatMessage): string | null {
  const candidates = [
    message.message_contract?.media?.[0]?.url,
    Array.isArray(message.media) ? message.media[0]?.url : null,
  ];
  for (const u of candidates) {
    if (typeof u === 'string' && u.trim()) return u.trim();
    if (u && typeof u === 'object' && 'url' in (u as object)) {
      const inner = (u as { url?: unknown }).url;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    }
  }
  return null;
}

function mediaFileName(message: ChatMessage): string | null {
  const candidates: unknown[] = [
    message.message_contract?.media?.[0]?.fileName,
    Array.isArray(message.media) ? message.media[0]?.fileName : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  const url = firstRenderableMediaUrl(message);
  if (!url) return null;
  try {
    if (url.startsWith('data:')) return null;
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (!seg) return null;
    const decoded = decodeURIComponent(seg);
    return decoded.replace(/^[0-9a-f-]{8,}_/i, '') || decoded;
  } catch {
    return null;
  }
}

/** Mesma base da API que `coerceMediaUrl` em chat.ts — garante `/media/...` absoluto no browser. */
function resolveDocumentHref(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const raw = rawUrl.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  if (raw.startsWith('media/')) return `${base}/${raw}`;
  return raw;
}

function ChatMessageImage({
  rawUrl,
  caption,
}: {
  rawUrl: string;
  caption?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const displaySrc = resolveDocumentHref(rawUrl) || rawUrl;

  if (failed) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-2 py-3 text-center">
        <p className="text-xs text-muted-foreground">Imagem indisponível</p>
        {caption ? <p className={`mt-2 text-xs opacity-90 ${CHAT_MSG_TEXT}`}>{caption}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="block w-full overflow-hidden rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => window.open(displaySrc, '_blank', 'noopener,noreferrer')}
      >
        <img
          src={displaySrc}
          alt=""
          className="max-h-64 max-w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            chatMediaDebugLog('chat_media_render_failed', { url: displaySrc });
            setFailed(true);
          }}
        />
      </button>
      {caption ? (
        <p className={`text-sm ${CHAT_MSG_TEXT}`}>{caption}</p>
      ) : null}
    </div>
  );
}

function dataUriToBlob(dataUri: string): Blob | null {
  try {
    const m = dataUri.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (!m) return null;
    const mime = (m[1] || 'application/octet-stream').trim();
    const b64 = m[2] || '';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function detectDocumentTypeLabel(mime: string, fileName: string | null): string {
  const lowerMime = (mime || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'PDF';
  if (lowerMime.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'DOC';
  if (lowerMime.includes('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) return 'TXT';
  return 'ARQ';
}

/** Conteúdo da bolha: texto + imagem conforme `message_contract` / mídia persistida */
export const ChatBubbleContent: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const c = message.message_contract;
  const kind = c?.kind;
  const rawMediaUrl = firstRenderableMediaUrl(message);
  const url = rawMediaUrl ? resolveDocumentHref(rawMediaUrl) || rawMediaUrl : null;
  const mime =
    c?.media?.[0]?.mimetype ||
    (Array.isArray(message.media) && message.media[0]?.mimetype) ||
    '';
  const text =
    coerceChatPlainText(c?.body) ||
    coerceChatPlainText(message.body) ||
    '';
  const docName = mediaFileName(message);

  const isAudioKind =
    kind === 'audio' ||
    (!!mime && typeof mime === 'string' && mime.startsWith('audio/'));

  if (isAudioKind && !url) {
    const sec =
      (typeof c?.media?.[0]?.seconds === 'number' ? c.media[0].seconds : null) ??
      (Array.isArray(message.media) && typeof message.media[0]?.seconds === 'number'
        ? message.media[0].seconds
        : null);
    const stub =
      c?.media?.[0]?.persistentStub === true ||
      (Array.isArray(message.media) && message.media[0]?.persistentStub === true);
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {typeof sec === 'number'
            ? `Áudio (${sec}s) — reprodução indisponível no momento.`
            : stub
              ? 'Áudio — reprodução indisponível no momento (metadados preservados).'
              : 'Áudio — sem URL de reprodução.'}
        </p>
        {text ? <p className={CHAT_MSG_TEXT}>{text}</p> : null}
      </div>
    );
  }

  if (isAudioKind && url) {
    return (
      <div className="space-y-1">
        <audio controls src={url} className="max-w-full" preload="metadata" />
        {text ? <p className={CHAT_MSG_TEXT}>{text}</p> : null}
      </div>
    );
  }

  const looksLikeImageUrl =
    !!url &&
    (mime.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ||
      /^data:image\//i.test(url));

  const isDocumentKind =
    kind === 'document' || (!!mime && typeof mime === 'string' && mime.includes('pdf'));

  if (isDocumentKind) {
    const typeLabel = detectDocumentTypeLabel(mime, docName);
    const documentHref = url;
    const isDataDocument = !!documentHref && documentHref.startsWith('data:');
    const handleOpenDocument = () => {
      if (!documentHref) return;
      if (!isDataDocument) {
        window.open(documentHref, '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = dataUriToBlob(documentHref);
      if (!blob) return;
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    };
    const handleDownloadDocument = () => {
      if (!documentHref) return;
      if (!isDataDocument) {
        const a = document.createElement('a');
        a.href = documentHref;
        a.download = docName || 'documento';
        a.rel = 'noreferrer';
        a.target = '_blank';
        a.click();
        return;
      }
      const blob = dataUriToBlob(documentHref);
      if (!blob) return;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = docName || 'documento.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    };
    return (
      <div className="space-y-1">
        <div className="rounded-md border border-border bg-background/70 px-2 py-1.5 dark:bg-background/50">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{docName || 'Documento sem título'}</p>
              <p className="text-[10px] text-muted-foreground">{typeLabel}</p>
            </div>
          </div>
          {documentHref ? (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={handleOpenDocument}
                className="inline-flex items-center gap-1 underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Visualizar
              </button>
              <button
                type="button"
                onClick={handleDownloadDocument}
                className="inline-flex items-center gap-1 underline"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs opacity-70">Link indisponível</p>
          )}
        </div>
        {text ? <p className={CHAT_MSG_TEXT}>{text}</p> : null}
      </div>
    );
  }

  if (
    kind &&
    kind !== 'text' &&
    kind !== 'image' &&
    kind !== 'sticker' &&
    !(kind === 'unknown' && looksLikeImageUrl)
  ) {
    const label =
      kind === 'video' ? 'Vídeo' : kind === 'audio' ? 'Áudio' : kind === 'document' ? 'Documento' : 'Mídia';
    return (
      <p className={CHAT_MSG_TEXT}>
        {text || `[${label}]`}
      </p>
    );
  }

  const showImage =
    url &&
    (kind === 'image' ||
      kind === 'sticker' ||
      (kind === 'unknown' && looksLikeImageUrl) ||
      (!kind && looksLikeImageUrl));

  if (showImage && url && rawMediaUrl) {
    const captionFromContract =
      typeof c?.caption === 'string' && c.caption.trim() ? c.caption.trim() : '';
    const captionFromBody =
      !captionFromContract &&
      text &&
      (kind === 'image' || kind === 'sticker' || kind === 'unknown' || !kind)
        ? text
        : '';
    const cap = captionFromContract || captionFromBody;
    return <ChatMessageImage rawUrl={rawMediaUrl} caption={cap || undefined} />;
  }

  if ((kind === 'image' || kind === 'sticker') && !rawMediaUrl) {
    chatMediaDebugLog('chat_media_url_missing', {
      messageId: message.id,
      kind: kind ?? 'unknown',
    });
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-2 py-3 text-center">
        <p className="text-xs text-muted-foreground">Imagem indisponível</p>
        {text ? <p className={`mt-2 text-xs ${CHAT_MSG_TEXT}`}>{text}</p> : null}
      </div>
    );
  }

  if (url && text) {
    return <p className={CHAT_MSG_TEXT}>{text}</p>;
  }

  if (text) {
    return <p className={CHAT_MSG_TEXT}>{text}</p>;
  }

  if (url) {
    return (
      <p className={`text-xs opacity-80 ${CHAT_MSG_TEXT}`}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="underline break-words [overflow-wrap:break-word] [word-break:normal]"
        >
          Abrir mídia
        </a>
      </p>
    );
  }

  return <p className="text-xs opacity-70">Mensagem sem conteúdo exibível</p>;
};
