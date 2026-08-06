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
  /**
   * @deprecated Preferir `getMeasureRef(id)` — ref compartilhado não limpa ResizeObserver no unmount.
   */
  measureRef: (element: HTMLElement | null) => void;
  /** Ref estável por conversa + ResizeObserver (re-mede quando foto/tags mudam a altura). */
  getMeasureRef: (conversationId: string) => (element: HTMLElement | null) => void;
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

  const rowObserversRef = useRef(new Map<string, ResizeObserver>());
  const measureBindersRef = useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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

  /** Remove observers/binders de ids que saíram da lista. */
  useEffect(() => {
    const alive = new Set(conversationIds);
    for (const id of [...rowObserversRef.current.keys()]) {
      if (alive.has(id)) continue;
      rowObserversRef.current.get(id)?.disconnect();
      rowObserversRef.current.delete(id);
      measureBindersRef.current.delete(id);
    }
  }, [conversationIds]);

  useEffect(
    () => () => {
      for (const ro of rowObserversRef.current.values()) ro.disconnect();
      rowObserversRef.current.clear();
      measureBindersRef.current.clear();
    },
    [],
  );

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
    const height = Math.ceil(element.getBoundingClientRect().height);
    if (height <= 0) return;
    if (engineRef.current.setHeight(conversationId, height)) {
      setHeightVersion((v) => v + 1);
    }
  }, []);

  const detachRowObserver = useCallback((conversationId: string) => {
    const ro = rowObserversRef.current.get(conversationId);
    if (!ro) return;
    ro.disconnect();
    rowObserversRef.current.delete(conversationId);
  }, []);

  const attachRowObserver = useCallback(
    (conversationId: string, element: HTMLElement) => {
      detachRowObserver(conversationId);
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        if (!enabledRef.current) return;
        measureElement(conversationId, element);
      });
      ro.observe(element);
      rowObserversRef.current.set(conversationId, ro);
    },
    [detachRowObserver, measureElement],
  );

  const getMeasureRef = useCallback(
    (conversationId: string) => {
      let binder = measureBindersRef.current.get(conversationId);
      if (!binder) {
        binder = (element: HTMLElement | null) => {
          if (!element) {
            detachRowObserver(conversationId);
            return;
          }
          if (!enabledRef.current) return;
          measureElement(conversationId, element);
          attachRowObserver(conversationId, element);
          // Segunda medida após layout (tags/foto) — evita clip/gap no 1º frame.
          requestAnimationFrame(() => {
            if (!enabledRef.current) return;
            measureElement(conversationId, element);
          });
        };
        measureBindersRef.current.set(conversationId, binder);
      }
      return binder;
    },
    [attachRowObserver, detachRowObserver, measureElement],
  );

  /** Compat: mede uma vez; sem cleanup de RO no unmount. */
  const measureRef = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const id = element.dataset.conversationId;
      if (!id) return;
      measureElement(id, element);
      attachRowObserver(id, element);
    },
    [attachRowObserver, measureElement],
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
    getMeasureRef,
  };
}
