import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const EVENT = 'painelcrm:chat-image-lightbox';

export type ChatImageLightboxDetail = {
  src: string;
  caption?: string | null;
};

/** Abre o lightbox global (acima do float / Dialogs). Evita nova aba e z-index do float. */
export function openChatImageLightbox(detail: ChatImageLightboxDetail): void {
  const src = String(detail?.src || '').trim();
  if (!src || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ChatImageLightboxDetail>(EVENT, {
      detail: { src, caption: detail.caption ?? null },
    }),
  );
}

export function ChatImageLightboxHost() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [caption, setCaption] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<ChatImageLightboxDetail>;
      const next = String(ce.detail?.src || '').trim();
      if (!next) return;
      setSrc(next);
      setCaption(typeof ce.detail?.caption === 'string' ? ce.detail.caption : null);
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
      <button
        type="button"
        className="absolute right-3 top-3 z-[10001] inline-flex h-9 w-9 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70"
        aria-label="Fechar"
        onClick={() => setOpen(false)}
      >
        <X className="h-5 w-5" />
      </button>
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
