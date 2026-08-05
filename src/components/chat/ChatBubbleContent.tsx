import React, { useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { coerceChatPlainText, groupMessageSenderPrefix, type ChatMessage } from '@/services/chat';
import { chatMediaDebugLog } from '@/lib/chatMediaDebug';
import { openChatImageLightbox } from '@/components/chat/ChatImageLightbox';

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

  const openPreview = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    openChatImageLightbox({ src: displaySrc, caption });
  };

  if (failed) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-2 py-3 text-center">
        <p className="text-xs text-muted-foreground">Imagem indisponível</p>
        {caption ? <p className={`mt-2 text-xs opacity-90 ${CHAT_MSG_TEXT}`}>{caption}</p> : null}
        <button
          type="button"
          className="mt-2 text-xs underline underline-offset-2"
          onClick={openPreview}
        >
          Tentar visualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-chat-image-preview=""
        className="block w-full cursor-zoom-in overflow-hidden rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        onClick={openPreview}
        onAuxClick={openPreview}
        onDragStart={(e) => {
          // Impede o Chrome de “soltar” a URL da imagem numa nova aba (drag nativo / ancestral draggable).
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          if (e.button === 1 || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        aria-label="Ampliar imagem"
      >
        <img
          src={displaySrc}
          alt=""
          className="pointer-events-none max-h-64 max-w-full select-none object-contain [-webkit-user-drag:none]"
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
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
export const ChatBubbleContent: React.FC<{
  message: ChatMessage;
  /** Mensagens recebidas em conversa de grupo: prefixo com nome do remetente quando disponível. */
  groupIncomingFormat?: boolean;
}> = ({ message, groupIncomingFormat }) => {
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
  const groupPrefix =
    groupIncomingFormat && message.direction === 'incoming'
      ? groupMessageSenderPrefix(message.metadata)
      : null;
  const displayText = groupPrefix && text ? `${groupPrefix}: ${text}` : text;
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
        {displayText ? <p className={CHAT_MSG_TEXT}>{displayText}</p> : null}
      </div>
    );
  }

  if (isAudioKind && url) {
    return (
      <div className="space-y-1">
        <audio controls src={url} className="max-w-full" preload="metadata" />
        {displayText ? <p className={CHAT_MSG_TEXT}>{displayText}</p> : null}
      </div>
    );
  }

  const mediaType =
    c?.media?.[0]?.type ||
    (Array.isArray(message.media) ? message.media[0]?.type : null) ||
    null;

  const looksLikeImageUrl =
    !!url &&
    (mime.startsWith('image/') ||
      mediaType === 'image' ||
      mediaType === 'sticker' ||
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ||
      /^data:image\//i.test(url) ||
      // URLs assinadas `/media/...` sem extensão: só se não parecer PDF/documento.
      (/\/media\//i.test(url) &&
        !/\.pdf(\?|$)/i.test(url) &&
        !mime.includes('pdf') &&
        kind !== 'document' &&
        mediaType !== 'document'));

  const isDocumentKind =
    (kind === 'document' || (!!mime && typeof mime === 'string' && mime.includes('pdf'))) &&
    !mime.startsWith('image/') &&
    mediaType !== 'image' &&
    mediaType !== 'sticker' &&
    !looksLikeImageUrl;

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
        {displayText ? <p className={CHAT_MSG_TEXT}>{displayText}</p> : null}
      </div>
    );
  }

  if (
    kind &&
    kind !== 'text' &&
    kind !== 'image' &&
    kind !== 'sticker' &&
    !(kind === 'unknown' && looksLikeImageUrl) &&
    !(kind === 'document' && looksLikeImageUrl) &&
    !looksLikeImageUrl
  ) {
    const label =
      kind === 'video' ? 'Vídeo' : kind === 'audio' ? 'Áudio' : kind === 'document' ? 'Documento' : 'Mídia';
    return (
      <p className={CHAT_MSG_TEXT}>
        {displayText || `[${label}]`}
      </p>
    );
  }

  const showImage =
    !!url &&
    (kind === 'image' ||
      kind === 'sticker' ||
      mediaType === 'image' ||
      mediaType === 'sticker' ||
      (kind === 'unknown' && looksLikeImageUrl) ||
      (kind === 'document' && looksLikeImageUrl) ||
      (!kind && looksLikeImageUrl) ||
      looksLikeImageUrl);

  if (showImage && url && rawMediaUrl) {
    const captionFromContract =
      typeof c?.caption === 'string' && c.caption.trim() ? c.caption.trim() : '';
    const captionFromBody =
      !captionFromContract &&
      displayText &&
      (kind === 'image' || kind === 'sticker' || kind === 'unknown' || kind === 'document' || !kind)
        ? displayText
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
        {displayText ? <p className={`mt-2 text-xs ${CHAT_MSG_TEXT}`}>{displayText}</p> : null}
      </div>
    );
  }

  if (url && displayText) {
    return <p className={CHAT_MSG_TEXT}>{displayText}</p>;
  }

  if (displayText) {
    return <p className={CHAT_MSG_TEXT}>{displayText}</p>;
  }

  if (url && rawMediaUrl && (looksLikeImageUrl || kind === 'image' || kind === 'sticker')) {
    return <ChatMessageImage rawUrl={rawMediaUrl} />;
  }

  if (url) {
    if (looksLikeImageUrl && rawMediaUrl) {
      return <ChatMessageImage rawUrl={rawMediaUrl} caption={displayText || undefined} />;
    }
    return (
      <p className={`text-xs opacity-80 ${CHAT_MSG_TEXT}`}>
        <button
          type="button"
          className="underline break-words"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >
          Abrir mídia
        </button>
      </p>
    );
  }

  return <p className="text-xs opacity-70">Mensagem sem conteúdo exibível</p>;
};
