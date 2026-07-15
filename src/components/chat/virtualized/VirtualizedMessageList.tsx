import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { VirtualizedMessageItem } from './VirtualizedMessageItem';
import type { UseVirtualizedMessagesResult } from './useVirtualizedMessages';
import { useChatPerfRender } from '@/features/chat-core/metrics/renderMetrics';
import {
  ChatLoadMoreMessagesBar,
  type ChatLoadMoreMessagesBarProps,
} from '@/components/chat/ChatLoadMoreMessagesBar';

export type VirtualizedMessageListProps<T extends { id: string }> = {
  messages: T[];
  virtual: UseVirtualizedMessagesResult<T>;
  renderMessage: (message: T, index: number) => ReactNode;
  itemGapClassName?: string;
  legacyListClassName?: string;
  legacyInnerClassName?: string;
  /** F6.1 — Load More no topo da thread (apenas Chat principal). */
  loadMore?: Pick<ChatLoadMoreMessagesBarProps, 'visible' | 'loading' | 'disabled' | 'onLoadMore'>;
};

/** Lista de mensagens — F6.4 core / TanStack legado / mapa integral abaixo do threshold. */
export function VirtualizedMessageList<T extends { id: string }>({
  messages,
  virtual,
  renderMessage,
  itemGapClassName = 'pb-2 md:pb-2',
  legacyListClassName = 'flex min-h-full w-full min-w-0 flex-col justify-end',
  legacyInnerClassName = 'w-full min-w-0 space-y-2 pb-2 md:space-y-2',
  loadMore,
}: VirtualizedMessageListProps<T>) {
  useChatPerfRender('VirtualizedMessageList');
  const { enabled, mode, virtualizer, core } = virtual;

  const loadMoreBar = loadMore ? (
    <ChatLoadMoreMessagesBar
      visible={loadMore.visible}
      loading={loadMore.loading}
      disabled={loadMore.disabled}
      onLoadMore={loadMore.onLoadMore}
    />
  ) : null;

  if (!enabled || mode === 'off') {
    return (
      <div className={legacyListClassName}>
        <div className={cn(legacyInnerClassName)}>
          {loadMoreBar}
          {messages.map((message, index) => (
            <div key={message.id}>{renderMessage(message, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  // F6.4 — Domain Store Message Virtual Engine
  if (mode === 'core' && core) {
    const containerStyle: CSSProperties = { height: `${core.totalHeight}px` };
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col justify-end">
        {loadMoreBar}
        <div className="relative w-full min-w-0" style={containerStyle}>
          {core.visibleItems.map(({ item, index, offsetTop }) => (
            <VirtualizedMessageItem
              key={item.id}
              index={index}
              start={offsetTop}
              messageId={item.id}
              measureElement={core.measureRef}
              className={itemGapClassName}
            >
              {renderMessage(item, index)}
            </VirtualizedMessageItem>
          ))}
        </div>
      </div>
    );
  }

  // Legado — @tanstack/react-virtual (Floating / CHAT_CORE_STORE OFF)
  if (!virtualizer) {
    return (
      <div className={legacyListClassName}>
        <div className={cn(legacyInnerClassName)}>
          {loadMoreBar}
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
      {loadMoreBar}
      <div className="relative w-full min-w-0" style={containerStyle}>
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) return null;
          return (
            <VirtualizedMessageItem
              key={message.id}
              index={virtualItem.index}
              start={virtualItem.start}
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
