/**
 * F6.4 — monitora scroll da thread e sincroniza viewport no store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession } from '../store/session';
import { chatDomainActionCreators } from '../store/actions';
import { recordMessageScrollFrame } from '../metrics/messageVirtualizationMetrics';

export type UseMessageScrollParams = {
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  conversationId?: string | null;
  onViewportChange?: (scrollTop: number, viewportHeight: number) => void;
};

export type UseMessageScrollResult = {
  onScroll: () => void;
  readViewport: () => { scrollTop: number; viewportHeight: number };
};

export function useMessageScroll(params: UseMessageScrollParams): UseMessageScrollResult {
  const { scrollRef, enabled, conversationId, onViewportChange } = params;
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
    recordMessageScrollFrame();

    if (!shouldUseChatDomainStore() || !enabled) return;
    const prev = lastSyncRef.current;
    if (
      Math.abs(prev.scrollTop - scrollTop) < 1 &&
      Math.abs(prev.viewportHeight - viewportHeight) < 1
    ) {
      return;
    }
    lastSyncRef.current = { scrollTop, viewportHeight };
    ensureChatDomainStoreSession()?.dispatch(
      chatDomainActionCreators.setMessageVirtualWindow({
        scrollTop,
        viewportHeight,
        enabled: true,
        conversationId: conversationId ?? null,
      }),
    );
  }, [conversationId, enabled, onViewportChange, readViewport]);

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
