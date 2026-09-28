/**
 * F6.3 — monitora scroll da lista de conversas e sincroniza viewport no store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession } from '../store/session';
import { chatDomainActionCreators } from '../store/actions';
import { recordConversationScrollFrame } from '../metrics/conversationVirtualizationMetrics';

export type UseConversationScrollParams = {
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  onViewportChange?: (scrollTop: number, viewportHeight: number) => void;
};

export type UseConversationScrollResult = {
  onScroll: () => void;
  readViewport: () => { scrollTop: number; viewportHeight: number };
};

export function useConversationScroll(
  params: UseConversationScrollParams,
): UseConversationScrollResult {
  const { scrollRef, enabled, onViewportChange } = params;
  const rafRef = useRef<number | null>(null);
  const lastSyncRef = useRef({ scrollTop: -1, viewportHeight: -1 });

  const readViewport = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return { scrollTop: 0, viewportHeight: 0 };
    return { scrollTop: el.scrollTop, viewportHeight: el.clientHeight };
  }, [scrollRef]);

  const sync = useCallback(() => {
    const { scrollTop, viewportHeight } = readViewport();
    onViewportChange?.(scrollTop, viewportHeight);
    recordConversationScrollFrame();

    if (!shouldUseChatDomainStore() || !enabled) return;
    const prev = lastSyncRef.current;
    // Sync store only when scroll moved enough or viewport resized (evita flood).
    if (
      Math.abs(prev.scrollTop - scrollTop) < 1 &&
      Math.abs(prev.viewportHeight - viewportHeight) < 1
    ) {
      return;
    }
    lastSyncRef.current = { scrollTop, viewportHeight };
    const store = ensureChatDomainStoreSession();
    store?.dispatch(
      chatDomainActionCreators.setConversationVirtualWindow({
        scrollTop,
        viewportHeight,
        enabled: true,
      }),
    );
  }, [enabled, onViewportChange, readViewport]);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      sync();
    });
  }, [sync]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      sync();
      return;
    }
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [enabled, scrollRef, sync]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { onScroll, readViewport };
}
