import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { VirtualizedMessageItem } from './VirtualizedMessageItem';
import type { UseVirtualizedMessagesResult } from './useVirtualizedMessages';

export type VirtualizedMessageListProps<T extends { id: string }> = {
  messages: T[];
  virtual: UseVirtualizedMessagesResult<T>;
  renderMessage: (message: T, index: number) => ReactNode;
  itemGapClassName?: string;
  legacyListClassName?: string;
  legacyInnerClassName?: string;
};

/** Lista de mensagens — virtualizada acima do threshold ou mapa legado abaixo. */
export function VirtualizedMessageList<T extends { id: string }>({
  messages,
  virtual,
  renderMessage,
  itemGapClassName = 'pb-2 md:pb-2',
  legacyListClassName = 'flex min-h-full w-full min-w-0 flex-col justify-end',
  legacyInnerClassName = 'w-full min-w-0 space-y-2 pb-2 md:space-y-2',
}: VirtualizedMessageListProps<T>) {
  const { enabled, virtualizer } = virtual;

  if (!enabled || !virtualizer) {
    return (
      <div className={legacyListClassName}>
        <div className={cn(legacyInnerClassName)}>
          {messages.map((message, index) => (
            <div key={message.id}>{renderMessage(message, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const containerStyle: CSSProperties = { height: `${virtualizer.getTotalSize()}px` };

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col justify-end">
      <div className="relative w-full min-w-0" style={containerStyle}>
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) return null;
          return (
            <VirtualizedMessageItem
              key={message.id}
              virtualItem={virtualItem}
              measureElement={virtualizer.measureElement}
              className={itemGapClassName}
            >
              {renderMessage(message, virtualItem.index)}
            </VirtualizedMessageItem>
          );
        })}
      </div>
    </div>
  );
}
