import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { markChatPerf } from '@/lib/chatPerformance';
import { shouldUseChatDomainStore } from '@/features/chat-core/store/flags';
import {
  useMessageVirtualization,
  type UseMessageVirtualizationResult,
} from '@/features/chat-core/virtualization/useMessageVirtualization';

export const CHAT_VIRTUALIZE_MIN_COUNT = 40;
export const CHAT_VIRTUALIZE_OVERSCAN_PAGE = 12;
export const CHAT_VIRTUALIZE_OVERSCAN_FLOAT = 8;
export const CHAT_NEAR_BOTTOM_THRESHOLD_PAGE = 120;
export const CHAT_NEAR_BOTTOM_THRESHOLD_FLOAT = 80;

export type VirtualizedMessagesVariant = 'page' | 'floating';

export function isChatMessageVirtualizationEnabled(messageCount: number): boolean {
  const flag = import.meta.env.VITE_CHAT_VIRTUAL_MESSAGES as string | undefined;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return messageCount >= 1;
  return messageCount >= CHAT_VIRTUALIZE_MIN_COUNT;
}

type MessageWithId = { id: string };

export type UseVirtualizedMessagesOptions<T extends MessageWithId> = {
  messages: T[];
  scrollRef: React.RefObject<HTMLElement | null>;
  conversationKey: string;
  variant: VirtualizedMessagesVariant;
  enabled: boolean;
};

/** Layout item do motor F6.4 (Domain Store). */
export type CoreVirtualMessageItem<T extends MessageWithId> = {
  index: number;
  offsetTop: number;
  height: number;
  item: T;
};

export type UseVirtualizedMessagesResult<T extends MessageWithId> = {
  enabled: boolean;
  /** `core` = F6.4 Message Virtual Engine; `legacy` = @tanstack/react-virtual. */
  mode: 'core' | 'legacy' | 'off';
  virtualizer: Virtualizer<HTMLElement, Element> | null;
  core: {
    totalHeight: number;
    visibleItems: CoreVirtualMessageItem<T>[];
    measureElement: (messageId: string, element: HTMLElement | null) => void;
    measureRef: (element: HTMLElement | null) => void;
  } | null;
  onScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToMessageId: (id: string) => boolean;
  isNearBottom: () => boolean;
};

function useLegacyVirtualizedMessages<T extends MessageWithId>(
  options: UseVirtualizedMessagesOptions<T>,
): UseVirtualizedMessagesResult<T> {
  const { messages, scrollRef, conversationKey, variant, enabled } = options;
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);
  const remeasureCountRef = useRef(0);

  const overscan = variant === 'floating' ? CHAT_VIRTUALIZE_OVERSCAN_FLOAT : CHAT_VIRTUALIZE_OVERSCAN_PAGE;
  const nearBottomThreshold =
    variant === 'floating' ? CHAT_NEAR_BOTTOM_THRESHOLD_FLOAT : CHAT_NEAR_BOTTOM_THRESHOLD_PAGE;

  const virtualizer = useVirtualizer({
    count: enabled ? messages.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (variant === 'floating' ? 68 : 92),
    overscan,
    getItemKey: (index) => messages[index]?.id ?? String(index),
  });

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= nearBottomThreshold;
  }, [scrollRef, nearBottomThreshold]);

  const onScroll = useCallback(() => {
    isNearBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      if (!enabled || messages.length === 0) {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        return;
      }
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior });
    },
    [enabled, messages.length, scrollRef, virtualizer],
  );

  const scrollToBottomRef = useRef(scrollToBottom);
  scrollToBottomRef.current = scrollToBottom;

  const scrollToMessageId = useCallback(
    (id: string): boolean => {
      if (!enabled) return false;
      const index = messages.findIndex((m) => m.id === id);
      if (index < 0) return false;
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      return true;
    },
    [enabled, messages, virtualizer],
  );

  const prevConversationKeyRef = useRef(conversationKey);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (prevConversationKeyRef.current === conversationKey) return;
    prevConversationKeyRef.current = conversationKey;
    isNearBottomRef.current = true;
    prevCountRef.current = 0;
    prevFirstIdRef.current = null;
    prevLastIdRef.current = null;
    scrollToBottomRef.current('auto');
  }, [conversationKey, enabled]);

  useLayoutEffect(() => {
    if (!enabled) return;
    isNearBottomRef.current = isNearBottom();
  }, [enabled, isNearBottom]);

  useLayoutEffect(() => {
    if (!enabled || messages.length === 0) return;

    const firstId = messages[0]?.id ?? null;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const count = messages.length;
    const prevCount = prevCountRef.current;

    const prepended =
      count > prevCount && firstId !== prevFirstIdRef.current && lastId === prevLastIdRef.current;
    const appended = count > prevCount && lastId !== prevLastIdRef.current;

    if (prepended && prevCount > 0) {
      const added = count - prevCount;
      virtualizer.scrollToIndex(added, { align: 'start', behavior: 'auto' });
    } else if (appended && isNearBottomRef.current) {
      scrollToBottomRef.current('auto');
    } else if (prevCount === 0) {
      scrollToBottomRef.current('auto');
    }

    prevCountRef.current = count;
    prevFirstIdRef.current = firstId;
    prevLastIdRef.current = lastId;
  }, [messages, enabled, virtualizer]);

  useEffect(() => {
    if (!import.meta.env.DEV || !enabled) return;
    const visible = virtualizer.getVirtualItems();
    markChatPerf(`chat_virtual_visible:${visible.length}`);
    if (import.meta.env.VITE_CHAT_VIRTUAL_DIAG === '1') {
      console.debug('[chat-virtual]', {
        virtualized_visible_items: visible.length,
        virtualized_total_items: messages.length,
        virtualized_remeasure_count: remeasureCountRef.current,
      });
    }
  });

  return {
    enabled,
    mode: enabled ? 'legacy' : 'off',
    virtualizer: enabled ? virtualizer : null,
    core: null,
    onScroll,
    scrollToBottom,
    scrollToMessageId,
    isNearBottom,
  };
}

function mapCoreResult<T extends MessageWithId>(
  core: UseMessageVirtualizationResult<T>,
): UseVirtualizedMessagesResult<T> {
  return {
    enabled: core.enabled,
    mode: core.enabled ? 'core' : 'off',
    virtualizer: null,
    core: core.enabled
      ? {
          totalHeight: core.totalHeight,
          visibleItems: core.visibleItems,
          measureElement: core.measureElement,
          measureRef: core.measureRef,
        }
      : null,
    onScroll: core.onScroll,
    scrollToBottom: core.scrollToBottom,
    scrollToMessageId: core.scrollToMessageId,
    isNearBottom: core.isNearBottom,
  };
}

/**
 * Virtualização de mensagens.
 * - Chat + CHAT_CORE_STORE ON → F6.4 Message Virtual Engine (`mode: 'core'`).
 * - Floating / store OFF → `@tanstack/react-virtual` legado (`mode: 'legacy'`).
 */
export function useVirtualizedMessages<T extends MessageWithId>(
  options: UseVirtualizedMessagesOptions<T>,
): UseVirtualizedMessagesResult<T> {
  const useCore =
    options.variant === 'page' && shouldUseChatDomainStore() && options.enabled;

  const coreResult = useMessageVirtualization({
    messages: options.messages,
    scrollRef: options.scrollRef,
    conversationKey: options.conversationKey,
    enabled: useCore,
    nearBottomThreshold: CHAT_NEAR_BOTTOM_THRESHOLD_PAGE,
  });

  const legacyResult = useLegacyVirtualizedMessages({
    ...options,
    enabled: options.enabled && !useCore,
  });

  if (useCore) {
    return mapCoreResult(coreResult);
  }
  return legacyResult;
}
