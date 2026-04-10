import React from 'react';
import { coerceChatPlainText, type ChatMessage } from '@/services/chat';

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

/** Conteúdo da bolha: texto + imagem conforme `message_contract` / mídia persistida */
export const ChatBubbleContent: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const c = message.message_contract;
  const kind = c?.kind;
  const url = firstRenderableMediaUrl(message);
  const mime =
    c?.media?.[0]?.mimetype ||
    (Array.isArray(message.media) && message.media[0]?.mimetype) ||
    '';
  const text =
    coerceChatPlainText(c?.body) ||
    coerceChatPlainText(message.body) ||
    '';

  if (import.meta.env.DEV && (kind === 'image' || (message.media?.length ?? 0) > 0)) {
    console.log('[ChatBubbleContent]', {
      id: message.id,
      contractKind: c?.kind,
      contractMedia0UrlLen:
        typeof c?.media?.[0]?.url === 'string' ? c.media[0].url.length : null,
      rawMedia0UrlLen:
        typeof message.media?.[0]?.url === 'string' ? message.media[0].url.length : null,
      resolvedUrlLen: typeof url === 'string' ? url.length : url ? 'non-string' : 0,
    });
  }

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
        {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
      </div>
    );
  }

  if (isAudioKind && url) {
    return (
      <div className="space-y-1">
        <audio controls src={url} className="max-w-full" preload="metadata" />
        {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
      </div>
    );
  }

  const looksLikeImageUrl =
    !!url &&
    (mime.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ||
      /^data:image\//i.test(url));

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
      <p className="whitespace-pre-wrap break-words">
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

  if (showImage) {
    return (
      <div className="space-y-1">
        <div className="overflow-hidden rounded-md">
          <img
            src={url}
            alt=""
            className="max-h-64 max-w-full object-contain"
            loading="lazy"
          />
        </div>
        {text ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : null}
      </div>
    );
  }

  if (url && text) {
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }

  if (text) {
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }

  if (url) {
    return (
      <p className="text-xs opacity-80">
        <a href={url} target="_blank" rel="noreferrer" className="underline">
          Abrir mídia
        </a>
      </p>
    );
  }

  return <p className="text-xs opacity-70">Mensagem sem conteúdo exibível</p>;
};
