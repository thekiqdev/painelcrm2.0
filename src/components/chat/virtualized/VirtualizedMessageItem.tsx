import { memo, type ReactNode } from 'react';
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

function VirtualizedMessageItemInner({
  index,
  start,
  measureElement,
  children,
  className,
  messageId,
}: VirtualizedMessageItemProps) {
  return (
    <div
      data-index={index}
      data-message-id={messageId}
      ref={measureElement}
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
