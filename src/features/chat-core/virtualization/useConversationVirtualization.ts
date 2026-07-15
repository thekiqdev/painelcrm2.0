/**
 * F6.3 — controla renderização virtual da lista de conversas (Chat sidebar).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession } from '../store/session';
import { chatDomainActionCreators } from '../store/actions';
import {
  createConversationVirtualEngine,
  type ConversationVirtualEngine,
} from './conversationVirtualEngine';
import { useConversationScroll } from './useConversationScroll';
import type { ConversationVirtualItemLayout } from './conversationOverscan';

export type ConversationVirtualListItem<T extends { id: string }> = ConversationVirtualItemLayout & {
  item: T;
};

export type UseConversationVirtualizationParams<T extends { id: string }> = {
  items: readonly T[];
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Quando false, não virtualiza (rollback / lista vazia). */
  enabled?: boolean;
};

export type UseConversationVirtualizationResult<T extends { id: string }> = {
  enabled: boolean;
  totalHeight: number;
  visibleItems: ConversationVirtualListItem<T>[];
  renderCount: number;
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  onScroll: () => void;
  measureElement: (conversationId: string, element: HTMLElement | null) => void;
  /** Preferir sobre measureElement em JSX — identidade estável entre renders. */
  measureRef: (element: HTMLElement | null) => void;
};

export function useConversationVirtualization<T extends { id: string }>(
  params: UseConversationVirtualizationParams<T>,
): UseConversationVirtualizationResult<T> {
  const storeOn = shouldUseChatDomainStore();
  const enabled = Boolean(params.enabled ?? true) && storeOn && params.items.length > 0;
  const engineRef = useRef<ConversationVirtualEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createConversationVirtualEngine();
  }

  const [viewport, setViewport] = useState({ scrollTop: 0, viewportHeight: 0 });
  const [heightVersion, setHeightVersion] = useState(0);

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

  const { onScroll } = useConversationScroll({
    scrollRef: params.scrollRef,
    enabled,
    onViewportChange,
  });

  const conversationIds = useMemo(() => params.items.map((i) => i.id), [params.items]);

  const windowState = useMemo(() => {
    if (!enabled) {
      return {
        visibleStart: 0,
        visibleEnd: params.items.length - 1,
        overscanStart: 0,
        overscanEnd: params.items.length - 1,
        scrollTop: 0,
        viewportHeight: 0,
        totalHeight: 0,
        renderCount: params.items.length,
        layouts: [] as ConversationVirtualItemLayout[],
      };
    }
    return engineRef.current!.compute({
      conversationIds,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.viewportHeight || 600,
    });
    // heightVersion força recompute após measure
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heightVersion intentional
  }, [enabled, conversationIds, viewport.scrollTop, viewport.viewportHeight, heightVersion, params.items.length]);

  useEffect(() => {
    if (!enabled || !storeOn) return;
    const store = ensureChatDomainStoreSession();
    store?.dispatch(
      chatDomainActionCreators.setConversationVirtualWindow({
        enabled: true,
        visibleStart: windowState.visibleStart,
        visibleEnd: windowState.visibleEnd,
        overscanStart: windowState.overscanStart,
        overscanEnd: windowState.overscanEnd,
        scrollTop: windowState.scrollTop,
        viewportHeight: windowState.viewportHeight,
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
  ]);

  useEffect(() => {
    if (!enabled) {
      ensureChatDomainStoreSession()?.dispatch(
        chatDomainActionCreators.setConversationVirtualizationEnabled(false),
      );
    }
  }, [enabled]);

  const visibleItems = useMemo((): ConversationVirtualListItem<T>[] => {
    if (!enabled) {
      return params.items.map((item, index) => ({
        item,
        index,
        offsetTop: 0,
        height: 0,
      }));
    }
    return windowState.layouts
      .map((layout) => {
        const item = params.items[layout.index];
        if (!item) return null;
        return { ...layout, item };
      })
      .filter((row): row is ConversationVirtualListItem<T> => row != null);
  }, [enabled, params.items, windowState.layouts]);

  const measureElement = useCallback((conversationId: string, element: HTMLElement | null) => {
    if (!element || !engineRef.current) return;
    const height = element.getBoundingClientRect().height;
    if (engineRef.current.setHeight(conversationId, height)) {
      setHeightVersion((v) => v + 1);
    }
  }, []);

  /** Ref estável — evita callback-ref novo a cada render (ciclo measure → setState). */
  const measureRef = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const id = element.dataset.conversationId;
      if (id) measureElement(id, element);
    },
    [measureElement],
  );

  return {
    enabled,
    totalHeight: enabled ? windowState.totalHeight : 0,
    visibleItems,
    renderCount: enabled ? windowState.renderCount : params.items.length,
    visibleStart: windowState.visibleStart,
    visibleEnd: windowState.visibleEnd,
    overscanStart: windowState.overscanStart,
    overscanEnd: windowState.overscanEnd,
    onScroll,
    measureElement,
    measureRef,
  };
}
