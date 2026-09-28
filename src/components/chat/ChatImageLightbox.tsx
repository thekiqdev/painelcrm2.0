import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

const EVENT = 'painelcrm:chat-image-lightbox';

export type ChatImageLightboxDetail = {
  src: string;
  caption?: string | null;
  fileName?: string | null;
};

function deriveFileNameFromSrc(src: string): string {
  const trimmed = src.trim();
  if (trimmed.startsWith('data:image/')) {
    const mime = trimmed.slice(5, trimmed.indexOf(';')).toLowerCase();
    const ext =
      mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : 'jpg';
    return `imagem.${ext}`;
  }
  try {
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return 'imagem';
    const u = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : undefined);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (!seg) return 'imagem';
    const decoded = decodeURIComponent(seg);
    const cleaned = decoded.replace(/^[0-9a-f-]{8,}_/i, '') || decoded;
    if (/\.(png|jpe?g|gif|webp)$/i.test(cleaned)) return cleaned;
    return `${cleaned.replace(/\.[^.]+$/, '') || 'imagem'}.jpg`;
  } catch {
    return 'imagem.jpg';
  }
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

function triggerBlobDownload(blobUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.rel = 'noreferrer';
  a.click();
}

async function downloadChatImage(src: string, preferredName?: string | null): Promise<void> {
  const fileName = (preferredName?.trim() || deriveFileNameFromSrc(src)).replace(/[/\\?%*:|"<>]/g, '_');

  if (src.startsWith('data:')) {
    const blob = dataUriToBlob(src);
    if (!blob) throw new Error('Não foi possível ler a imagem');
    const blobUrl = URL.createObjectURL(blob);
    triggerBlobDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    return;
  }

  if (src.startsWith('blob:')) {
    triggerBlobDownload(src, fileName);
    return;
  }

  const token = apiClient.getToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(src, { credentials: 'include', headers });
  if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  triggerBlobDownload(blobUrl, fileName);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}

/** Abre o lightbox global (acima do float / Dialogs). Evita nova aba e z-index do float. */
export function openChatImageLightbox(detail: ChatImageLightboxDetail): void {
  const src = String(detail?.src || '').trim();
  if (!src || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ChatImageLightboxDetail>(EVENT, {
      detail: {
        src,
        caption: detail.caption ?? null,
        fileName: detail.fileName ?? null,
      },
    }),
  );
}

export function ChatImageLightboxHost() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [caption, setCaption] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<ChatImageLightboxDetail>;
      const next = String(ce.detail?.src || '').trim();
      if (!next) return;
      setSrc(next);
      setCaption(typeof ce.detail?.caption === 'string' ? ce.detail.caption : null);
      setFileName(typeof ce.detail?.fileName === 'string' ? ce.detail.fileName : null);
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen as EventListener);
    return () => window.removeEventListener(EVENT, onOpen as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleDownload = useCallback(async () => {
    if (!src || downloading) return;
    setDownloading(true);
    try {
      await downloadChatImage(src, fileName);
      toast.success('Download iniciado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao baixar';
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }, [downloading, fileName, src]);

  if (!open || !src || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da imagem"
      onClick={() => setOpen(false)}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="absolute right-3 top-3 z-[10001] flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black/50 px-3 text-sm text-white hover:bg-black/70 disabled:opacity-60"
          aria-label="Baixar imagem"
          disabled={downloading}
          onClick={(e) => {
            e.stopPropagation();
            void handleDownload();
          }}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Baixar
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
          aria-label="Fechar"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={caption?.trim() || 'Imagem da conversa'}
          className="max-h-[min(88vh,900px)] max-w-[min(96vw,56rem)] object-contain select-none"
          referrerPolicy="no-referrer"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
        {caption?.trim() ? (
          <p className="max-w-[min(96vw,36rem)] text-center text-sm text-white/90">{caption.trim()}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
