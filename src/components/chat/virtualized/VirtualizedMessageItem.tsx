import { memo, type ReactNode } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export type VirtualizedMessageItemProps = {
  virtualItem: VirtualItem;
  measureElement: (node: Element | null) => void;
  children: ReactNode;
  className?: string;
};

function VirtualizedMessageItemInner({
  virtualItem,
  measureElement,
  children,
  className,
}: VirtualizedMessageItemProps) {
  return (
    <div
      data-index={virtualItem.index}
      ref={measureElement}
      className={cn('absolute left-0 top-0 w-full min-w-0', className)}
      style={{
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      {children}
    </div>
  );
}

export const VirtualizedMessageItem = memo(VirtualizedMessageItemInner);
