import { memo, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type VirtualizedMessageItemProps = {
  index: number;
  start: number;
  measureElement: (node: Element | null) => void;
  children: ReactNode;
  className?: string;
  /** Quando setado, o measureRef estável lê este atributo (F6.4 core). */
  messageId?: string;
};

/**
 * Item absoluto da lista virtualizada.
 * ResizeObserver remede a altura quando mídia (ex.: imagem) carrega — evita bolhas
 * sobrepostas no /chat com estimateSize menor que o conteúdo real.
 */
function VirtualizedMessageItemInner({
  index,
  start,
  measureElement,
  children,
  className,
  messageId,
}: VirtualizedMessageItemProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const measureRefStable = useRef(measureElement);
  measureRefStable.current = measureElement;

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      measureElement(node);
    },
    [measureElement],
  );

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = nodeRef.current;
        if (el) measureRefStable.current(el);
      });
    });
    ro.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [index, messageId]);

  return (
    <div
      data-index={index}
      data-message-id={messageId}
      ref={setRefs}
      className={cn('absolute left-0 top-0 w-full min-w-0', className)}
      style={{
        transform: `translateY(${start}px)`,
      }}
    >
      {children}
    </div>
  );
}

export const VirtualizedMessageItem = memo(VirtualizedMessageItemInner);
