/**
 * F6.4 — virtualiza a thread de mensagens (Chat + Domain Store).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession } from '../store/session';
import { chatDomainActionCreators } from '../store/actions';
import {
  createMessageVirtualEngine,
  type MessageVirtualEngine,
} from './messageVirtualEngine';
import { useMessageScroll } from './useMessageScroll';
import type { MessageVirtualItemLayout } from './messageOverscan';
import {
  recordMessageAppend,
  recordMessagePrepend,
} from '../metrics/messageVirtualizationMetrics';
import { getMessageVirtualConfig } from './messageOverscan';

export type MessageVirtualListItem<T extends { id: string }> = MessageVirtualItemLayout & {
  item: T;
};

export type UseMessageVirtualizationParams<T extends { id: string }> = {
  messages: readonly T[];
  scrollRef: React.RefObject<HTMLElement | null>;
  conversationKey: string;
  enabled?: boolean;
  nearBottomThreshold?: number;
};

export type UseMessageVirtualizationResult<T extends { id: string }> = {
  enabled: boolean;
  totalHeight: number;
  visibleItems: MessageVirtualListItem<T>[];
  renderCount: number;
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  onScroll: () => void;
  measureElement: (messageId: string, element: HTMLElement | null) => void;
  /** Preferir sobre measureElement em JSX — identidade estável entre renders. */
  measureRef: (element: HTMLElement | null) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToMessageId: (id: string) => boolean;
  isNearBottom: () => boolean;
};

export function useMessageVirtualization<T extends { id: string }>(
  params: UseMessageVirtualizationParams<T>,
): UseMessageVirtualizationResult<T> {
  const storeOn = shouldUseChatDomainStore();
  const enabled =
    Boolean(params.enabled ?? true) && storeOn && params.messages.length > 0;
  const nearBottomThreshold = params.nearBottomThreshold ?? 120;

  const engineRef = useRef<MessageVirtualEngine | null>(null);
  if (!engineRef.current) engineRef.current = createMessageVirtualEngine();

  const [viewport, setViewport] = useState({ scrollTop: 0, viewportHeight: 0 });
  const [heightVersion, setHeightVersion] = useState(0);
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);
  const prevConversationKeyRef = useRef(params.conversationKey);

  const onViewportChange = useCallback((scrollTop: number, viewportHeight: number) => {
    setViewport((prev) => {
      if (
        Math.abs(prev.scrollTop - scrollTop) < 0.5 &&
        Math.abs(prev.viewportHeight - viewportHeight) < 0.5
      ) {
        return prev;
      }
      return { scrollTop, viewportHeight };
    });
  }, []);

  const { onScroll: scrollHandler, readViewport } = useMessageScroll({
    scrollRef: params.scrollRef,
    enabled,
    conversationId: params.conversationKey || null,
    onViewportChange,
  });

  const isNearBottom = useCallback(() => {
    const el = params.scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= nearBottomThreshold;
  }, [nearBottomThreshold, params.scrollRef]);

  const onScroll = useCallback(() => {
    isNearBottomRef.current = isNearBottom();
    scrollHandler();
  }, [isNearBottom, scrollHandler]);

  const messageIds = useMemo(() => params.messages.map((m) => m.id), [params.messages]);

  const windowState = useMemo(() => {
    if (!enabled) {
      return {
        visibleStart: 0,
        visibleEnd: params.messages.length - 1,
        overscanStart: 0,
        overscanEnd: params.messages.length - 1,
        scrollTop: 0,
        viewportHeight: 0,
        totalHeight: 0,
        renderCount: params.messages.length,
        layouts: [] as MessageVirtualItemLayout[],
      };
    }
    return engineRef.current!.compute({
      messageIds,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.viewportHeight || 600,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heightVersion intentional
  }, [
    enabled,
    messageIds,
    viewport.scrollTop,
    viewport.viewportHeight,
    heightVersion,
    params.messages.length,
  ]);

  useEffect(() => {
    if (!enabled || !storeOn) return;
    ensureChatDomainStoreSession()?.dispatch(
      chatDomainActionCreators.setMessageVirtualWindow({
        enabled: true,
        visibleStart: windowState.visibleStart,
        visibleEnd: windowState.visibleEnd,
        overscanStart: windowState.overscanStart,
        overscanEnd: windowState.overscanEnd,
        scrollTop: windowState.scrollTop,
        viewportHeight: windowState.viewportHeight,
        conversationId: params.conversationKey || null,
      }),
    );
  }, [
    enabled,
    storeOn,
    windowState.visibleStart,
    windowState.visibleEnd,
    windowState.overscanStart,
    windowState.overscanEnd,
    windowState.scrollTop,
    windowState.viewportHeight,
    params.conversationKey,
  ]);

  useEffect(() => {
    if (!enabled) {
      ensureChatDomainStoreSession()?.dispatch(
        chatDomainActionCreators.setMessageVirtualizationEnabled(false),
      );
    }
  }, [enabled]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = params.scrollRef.current;
      if (!el) return;
      const top = el.scrollHeight - el.clientHeight;
      if (behavior === 'smooth' && typeof el.scrollTo === 'function') {
        el.scrollTo({ top, behavior: 'smooth' });
      } else {
        el.scrollTop = top;
      }
      isNearBottomRef.current = true;
    },
    [params.scrollRef],
  );

  const scrollToBottomRef = useRef(scrollToBottom);
  scrollToBottomRef.current = scrollToBottom;

  const scrollToMessageId = useCallback(
    (id: string): boolean => {
      if (!enabled) return false;
      const index = params.messages.findIndex((m) => m.id === id);
      if (index < 0) return false;
      const estimated = getMessageVirtualConfig().estimatedRowHeight;
      let offset = 0;
      for (let i = 0; i < index; i++) {
        const mid = params.messages[i]?.id;
        offset += mid ? engineRef.current!.heightCache.get(mid) : estimated;
      }
      const el = params.scrollRef.current;
      if (!el) return false;
      const rowH = engineRef.current!.heightCache.get(id);
      el.scrollTop = Math.max(0, offset - el.clientHeight / 2 + rowH / 2);
      return true;
    },
    [enabled, params.messages, params.scrollRef],
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    if (prevConversationKeyRef.current === params.conversationKey) return;
    prevConversationKeyRef.current = params.conversationKey;
    engineRef.current?.clearHeights();
    isNearBottomRef.current = true;
    prevCountRef.current = 0;
    prevFirstIdRef.current = null;
    prevLastIdRef.current = null;
    scrollToBottomRef.current('auto');
  }, [params.conversationKey, enabled]);

  useLayoutEffect(() => {
    if (!enabled || params.messages.length === 0) return;

    const firstId = params.messages[0]?.id ?? null;
    const lastId = params.messages[params.messages.length - 1]?.id ?? null;
    const count = params.messages.length;
    const prevCount = prevCountRef.current;

    const prepended =
      count > prevCount && firstId !== prevFirstIdRef.current && lastId === prevLastIdRef.current;
    const appended = count > prevCount && lastId !== prevLastIdRef.current;

    const el = params.scrollRef.current;
    if (prepended && prevCount > 0 && el) {
      const added = count - prevCount;
      recordMessagePrepend(added);
      const estimated = getMessageVirtualConfig().estimatedRowHeight;
      let delta = 0;
      for (let i = 0; i < added; i++) {
        const mid = params.messages[i]?.id;
        delta += mid ? engineRef.current!.heightCache.get(mid) : estimated;
      }
      el.scrollTop = el.scrollTop + delta;
    } else if (appended && isNearBottomRef.current) {
      recordMessageAppend(count - prevCount);
      scrollToBottomRef.current('auto');
    } else if (prevCount === 0) {
      scrollToBottomRef.current('auto');
    } else if (appended) {
      recordMessageAppend(count - prevCount);
    }

    prevCountRef.current = count;
    prevFirstIdRef.current = firstId;
    prevLastIdRef.current = lastId;
  }, [params.messages, enabled, params.scrollRef]);

  useLayoutEffect(() => {
    if (!enabled) return;
    isNearBottomRef.current = isNearBottom();
  }, [enabled, isNearBottom]);

  const visibleItems = useMemo((): MessageVirtualListItem<T>[] => {
    if (!enabled) {
      return params.messages.map((item, index) => ({
        item,
        index,
        offsetTop: 0,
        height: 0,
      }));
    }
    return windowState.layouts
      .map((layout) => {
        const item = params.messages[layout.index];
        if (!item) return null;
        return { ...layout, item };
      })
      .filter((row): row is MessageVirtualListItem<T> => row != null);
  }, [enabled, params.messages, windowState.layouts]);

  const measureElement = useCallback((messageId: string, element: HTMLElement | null) => {
    if (!element || !engineRef.current) return;
    const height = element.getBoundingClientRect().height;
    if (engineRef.current.setHeight(messageId, height)) {
      setHeightVersion((v) => v + 1);
    }
  }, []);

  /** Ref estável — evita callback-ref novo a cada render (ciclo measure → setState). */
  const measureRef = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const id = element.dataset.messageId;
      if (id) measureElement(id, element);
    },
    [measureElement],
  );

  void readViewport;

  return {
    enabled,
    totalHeight: enabled ? windowState.totalHeight : 0,
    visibleItems,
    renderCount: enabled ? windowState.renderCount : params.messages.length,
    visibleStart: windowState.visibleStart,
    visibleEnd: windowState.visibleEnd,
    overscanStart: windowState.overscanStart,
    overscanEnd: windowState.overscanEnd,
    onScroll,
    measureElement,
    measureRef,
    scrollToBottom,
    scrollToMessageId,
    isNearBottom,
  };
}
