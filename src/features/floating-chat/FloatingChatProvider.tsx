import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { chatService } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { emitChatNavUnreadRefresh } from '@/lib/chatNavUnreadEvents';
import { emitKanbanConversationUnread } from '@/lib/kanbanConversationUnreadBridge';
import { resolveConversationIdForCrmRecord } from '@/lib/resolveChatConversationForCrm';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/components/ui/sonner';
import { FLOATING_CHAT_MAX_EXPANDED } from './constants';
import { MobileConversationOverlay } from './MobileConversationOverlay';
import { isFloatingChatEscapeBlocked } from './floatingChatEscapeGuard';
import {
  loadFloatingChatPersisted,
  panelsToPersistedState,
  persistedStateToPanels,
  saveFloatingChatPersisted,
} from './persist';
import type { FloatingChatPanel } from './floatingChatTypes';
import { FloatingChatContext, type FloatingChatContextValue } from './floatingChatContext';
import {
  invalidateFloatingChatAggregates,
  invalidateFloatingChatConversationMeta,
  prefetchFloatingChatLists,
} from './floatingChatQueries';

function countExpanded(panels: FloatingChatPanel[]): number {
  return panels.filter((p) => !p.minimized).length;
}

const PERSIST_DEBOUNCE_MS = 160;

/** Mantém ID se a conversa existe ou se o erro não for 404 (evita limpar tudo após F5 com API ainda indisponível). */
async function resolvePersistedConversationIdsToKeep(ids: string[]): Promise<Set<string>> {
  const keep = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      const probe = await chatService.probeFloatingChatConversationPersist(id);
      if (probe === 'valid' || probe === 'uncertain') keep.add(id);
    }),
  );
  return keep;
}

export function FloatingChatProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const persistEnabledRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const latestPersistRef = useRef({
    listOpen: false,
    panels: [] as FloatingChatPanel[],
    activeWindowId: null as string | null,
  });
  const [listOpen, setListOpen] = useState(false);
  const [panels, setPanels] = useState<FloatingChatPanel[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [pulseUntil, setPulseUntil] = useState<Record<string, number>>({});
  const [composerDrafts, setComposerDraftsState] = useState<Record<string, string>>({});
  const [compactProfileOpenByConversationId, setCompactProfileOpenByConversationId] = useState<Record<string, boolean>>(
    {},
  );
  const [appointmentPanelOpenByConversationId, setAppointmentPanelOpenByConversationId] = useState<
    Record<string, boolean>
  >({});
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [mobileOverlayConversationId, setMobileOverlayConversationId] = useState<string | null>(null);
  const mobileOverlayConversationIdRef = useRef<string | null>(null);
  const mobileOverlayPushedRef = useRef(false);
  const closingMobileViaHistoryRef = useRef(false);

  const panelsRef = useRef(panels);
  const activeWindowIdRef = useRef(activeWindowId);
  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);
  useEffect(() => {
    activeWindowIdRef.current = activeWindowId;
  }, [activeWindowId]);
  useEffect(() => {
    latestPersistRef.current = { listOpen, panels, activeWindowId };
  }, [listOpen, panels, activeWindowId]);

  const inboxScope = user?.tenant_id ? ('tenant' as const) : ('owner' as const);

  const refreshInstances = useCallback(async () => {
    if (!user?.id) {
      setInstanceIds([]);
      setInstancesLoading(false);
      return;
    }
    setInstancesLoading(true);
    try {
      const instances = await chatService.listInstances();
      const ids = instances
        .filter(
          (inst) =>
            (inst.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false,
        )
        .map((i) => i.id);
      setInstanceIds(ids);
    } catch {
      setInstanceIds([]);
    } finally {
      setInstancesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshInstances();
  }, [refreshInstances]);

  /** Pré-aquece listas em background (abertura instantânea da lista/bubble). */
  useEffect(() => {
    if (!user?.id || instanceIds.length === 0) return;
    void prefetchFloatingChatLists(queryClient, instanceIds, inboxScope);
  }, [user?.id, instanceIds, inboxScope, queryClient]);

  useLayoutEffect(() => {
    const saved = loadFloatingChatPersisted();
    if (saved) {
      setListOpen(saved.listOpen);
      setPanels(persistedStateToPanels(saved));
      setActiveWindowId(saved.activeConversationId);
    }
    persistEnabledRef.current = true;
  }, []);

  useEffect(() => {
    if (!persistEnabledRef.current) return;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const { listOpen: lo, panels: ps, activeWindowId: aw } = latestPersistRef.current;
      saveFloatingChatPersisted(panelsToPersistedState(ps, aw, lo));
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [listOpen, panels, activeWindowId]);

  /** F5 / fecho de aba: o debounce de 160ms pode não disparar — grava estado atual de imediato. */
  useEffect(() => {
    const flush = () => {
      if (!persistEnabledRef.current) return;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const { listOpen: lo, panels: ps, activeWindowId: aw } = latestPersistRef.current;
      saveFloatingChatPersisted(panelsToPersistedState(ps, aw, lo));
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!persistEnabledRef.current) return;
      const { listOpen: lo, panels: ps, activeWindowId: aw } = latestPersistRef.current;
      saveFloatingChatPersisted(panelsToPersistedState(ps, aw, lo));
    };
  }, []);

  useEffect(() => {
    const onConvUpd = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      invalidateFloatingChatAggregates(queryClient);
      if (typeof cid === 'string') {
        invalidateFloatingChatConversationMeta(queryClient, cid);
      }
    };
    const onNotif = () => {
      invalidateFloatingChatAggregates(queryClient);
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConvUpd);
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onNotif);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConvUpd);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onNotif);
    };
  }, [queryClient]);

  /** Mensagens recebidas: badges, pulse em minimizada, sem duplicar refresh na janela ativa. */
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      const dir = d?.direction as string | undefined;
      if (typeof cid !== 'string') return;
      if (dir !== 'incoming') return;

      const list = panelsRef.current;
      const panel = list.find((p) => p.conversationId === cid);
      const active = activeWindowIdRef.current;

      if (!panel) {
        if (mobileOverlayConversationIdRef.current === cid) {
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', cid] });
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', cid] });
        }
        emitChatNavUnreadRefresh();
        invalidateFloatingChatAggregates(queryClient);
        return;
      }

      if (!panel.minimized && active === cid) {
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', cid] });
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', cid] });
        return;
      }

      if (panel.minimized) {
        const until = Date.now() + 4000;
        setPulseUntil((prev) => ({ ...prev, [cid]: until }));
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'minimized-meta'] });
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', cid] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', cid] });
        void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', cid] });
      }

      emitChatNavUnreadRefresh();
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, handler);
    return () => window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, handler);
  }, [queryClient]);

  useEffect(() => {
    mobileOverlayConversationIdRef.current = mobileOverlayConversationId;
  }, [mobileOverlayConversationId]);

  useEffect(() => {
    const onPop = () => {
      if (closingMobileViaHistoryRef.current) {
        closingMobileViaHistoryRef.current = false;
        mobileOverlayPushedRef.current = false;
        return;
      }
      mobileOverlayConversationIdRef.current = null;
      mobileOverlayPushedRef.current = false;
      setMobileOverlayConversationId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setPulseUntil((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const k of Object.keys(next)) {
          if ((next[k] ?? 0) <= now) {
            delete next[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  /**
   * Remover só conversas confirmadas como inexistentes (404).
   * Não correr enquanto o auth ainda carrega — evita pedidos sem sessão estável e “limpezas” em falso.
   */
  useEffect(() => {
    if (authLoading || !user?.id) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const current = panelsRef.current;
      const ids = [...new Set(current.map((p) => p.conversationId))];
      if (ids.length === 0) return;
      void (async () => {
        const keep = await resolvePersistedConversationIdsToKeep(ids);
        if (cancelled) return;
        setPanels((prev) => {
          const next = prev.filter((p) => keep.has(p.conversationId));
          return next.length === prev.length ? prev : next;
        });
        setActiveWindowId((prev) => (prev && keep.has(prev) ? prev : null));
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [user?.id, authLoading]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (isFloatingChatEscapeBlocked()) return;

      if (mobileOverlayConversationIdRef.current) {
        event.preventDefault();
        mobileOverlayConversationIdRef.current = null;
        setMobileOverlayConversationId(null);
        if (mobileOverlayPushedRef.current) {
          mobileOverlayPushedRef.current = false;
          closingMobileViaHistoryRef.current = true;
          window.history.back();
        }
        return;
      }

      const aw = activeWindowIdRef.current;
      const list = panelsRef.current;
      const activeExpanded =
        aw && list.some((p) => p.conversationId === aw && !p.minimized);

      if (activeExpanded) {
        event.preventDefault();
        minimizePanelRef.current(aw);
        return;
      }

      if (latestPersistRef.current.listOpen) {
        event.preventDefault();
        setListOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setComposerDraft = useCallback((conversationId: string, text: string) => {
    setComposerDraftsState((prev) => ({ ...prev, [conversationId]: text }));
  }, []);

  const toggleList = useCallback(() => {
    setListOpen((v) => !v);
  }, []);

  const focusWindow = useCallback((conversationId: string) => {
    setActiveWindowId(conversationId);
  }, []);

  const clearPulseFor = useCallback((conversationId: string) => {
    setPulseUntil((prev) => {
      if (!(conversationId in prev)) return prev;
      const { [conversationId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const closeMobileConversationOverlay = useCallback(() => {
    mobileOverlayConversationIdRef.current = null;
    setMobileOverlayConversationId(null);
    if (mobileOverlayPushedRef.current) {
      mobileOverlayPushedRef.current = false;
      closingMobileViaHistoryRef.current = true;
      window.history.back();
    }
  }, []);

  const openOrFocusConversation = useCallback(
    (conversationId: string) => {
      setActiveWindowId(conversationId);
      setPanels((prev) => {
        const idx = prev.findIndex((p) => p.conversationId === conversationId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], minimized: false };
          let exp = countExpanded(next);
          if (exp > FLOATING_CHAT_MAX_EXPANDED) {
            for (let i = 0; i < next.length && exp > FLOATING_CHAT_MAX_EXPANDED; i++) {
              if (i !== idx && !next[i].minimized) {
                next[i] = { ...next[i], minimized: true };
                exp -= 1;
              }
            }
          }
          return next;
        }
        const adding: FloatingChatPanel = { conversationId, minimized: false };
        let next = [...prev, adding];
        let exp = countExpanded(next);
        if (exp > FLOATING_CHAT_MAX_EXPANDED) {
          for (let i = 0; i < next.length - 1 && exp > FLOATING_CHAT_MAX_EXPANDED; i++) {
            if (!next[i].minimized) {
              next[i] = { ...next[i], minimized: true };
              exp -= 1;
            }
          }
        }
        return next;
      });
      setListOpen(false);
      clearPulseFor(conversationId);
      emitKanbanConversationUnread(conversationId, 0);
      void chatService.markConversationRead(conversationId).then(() => {
        emitChatNavUnreadRefresh();
        invalidateFloatingChatAggregates(queryClient);
        invalidateFloatingChatConversationMeta(queryClient, conversationId);
      });
    },
    [clearPulseFor, queryClient],
  );

  const openConversationInContext = useCallback(
    (conversationId: string) => {
      if (isMobile) {
        mobileOverlayConversationIdRef.current = conversationId;
        setMobileOverlayConversationId(conversationId);
        if (!mobileOverlayPushedRef.current) {
          mobileOverlayPushedRef.current = true;
          window.history.pushState({ painelcrmMobileChat: true }, '', window.location.href);
        }
        clearPulseFor(conversationId);
        emitKanbanConversationUnread(conversationId, 0);
        void chatService.markConversationRead(conversationId).then(() => {
          emitChatNavUnreadRefresh();
          invalidateFloatingChatAggregates(queryClient);
          invalidateFloatingChatConversationMeta(queryClient, conversationId);
        });
      } else {
        openOrFocusConversation(conversationId);
      }
    },
    [isMobile, clearPulseFor, queryClient, openOrFocusConversation],
  );

  const openChatForClient = useCallback(
    async (clientId: string) => {
      const cid = await resolveConversationIdForCrmRecord({
        clientId,
        instanceIds,
        inboxScope,
      });
      if (!cid) {
        toast.info('Nenhuma conversa WhatsApp encontrada para este cliente.');
        return null;
      }
      openConversationInContext(cid);
      return cid;
    },
    [instanceIds, inboxScope, openConversationInContext],
  );

  const openChatForLead = useCallback(
    async (leadId: string, options?: { createIfMissing?: boolean }) => {
      const cid = await resolveConversationIdForCrmRecord({
        leadId,
        instanceIds,
        inboxScope,
      });
      if (!cid) {
        if (options?.createIfMissing) return null;
        toast.info('Nenhuma conversa WhatsApp encontrada para este lead.');
        return null;
      }
      openConversationInContext(cid);
      return cid;
    },
    [instanceIds, inboxScope, openConversationInContext],
  );

  useEffect(() => {
    const onOpenFromHost = (ev: Event) => {
      const d = (ev as CustomEvent<{ conversationId?: string }>).detail;
      const id = d?.conversationId;
      if (typeof id === 'string' && id.length > 0) {
        openConversationInContext(id);
      }
    };
    window.addEventListener('painelcrm:floating-chat-open', onOpenFromHost);
    return () => window.removeEventListener('painelcrm:floating-chat-open', onOpenFromHost);
  }, [openConversationInContext]);

  const minimizePanel = useCallback((conversationId: string) => {
    setPanels((prev) =>
      prev.map((p) => (p.conversationId === conversationId ? { ...p, minimized: true } : p)),
    );
    setActiveWindowId((prev) => (prev === conversationId ? null : prev));
  }, []);

  const minimizePanelRef = useRef(minimizePanel);
  minimizePanelRef.current = minimizePanel;

  const expandPanel = useCallback(
    (conversationId: string) => {
      setActiveWindowId(conversationId);
      clearPulseFor(conversationId);
      setPanels((prev) => {
        const idx = prev.findIndex((p) => p.conversationId === conversationId);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], minimized: false };
        let exp = countExpanded(next);
        if (exp > FLOATING_CHAT_MAX_EXPANDED) {
          for (let i = 0; i < next.length && exp > FLOATING_CHAT_MAX_EXPANDED; i++) {
            if (i !== idx && !next[i].minimized) {
              next[i] = { ...next[i], minimized: true };
              exp -= 1;
            }
          }
        }
        return next;
      });
      emitKanbanConversationUnread(conversationId, 0);
      void chatService.markConversationRead(conversationId).then(() => {
        emitChatNavUnreadRefresh();
        invalidateFloatingChatAggregates(queryClient);
        invalidateFloatingChatConversationMeta(queryClient, conversationId);
      });
    },
    [clearPulseFor, queryClient],
  );

  const closePanel = useCallback((conversationId: string) => {
    setPanels((prev) => prev.filter((p) => p.conversationId !== conversationId));
    setComposerDraftsState((prev) => {
      const { [conversationId]: _, ...rest } = prev;
      return rest;
    });
    setCompactProfileOpenByConversationId((prev) => {
      const { [conversationId]: _omit, ...rest } = prev;
      return rest;
    });
    setAppointmentPanelOpenByConversationId((prev) => {
      const { [conversationId]: _omitAppt, ...rest } = prev;
      return rest;
    });
    setActiveWindowId((prev) => (prev === conversationId ? null : prev));
    clearPulseFor(conversationId);
  }, [clearPulseFor]);

  useEffect(() => {
    const onConversationDeleted = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const conversationId =
        typeof detail?.conversation_id === 'string'
          ? detail.conversation_id
          : typeof detail?.id === 'string'
          ? detail.id
          : null;
      if (!conversationId) return;
      closePanel(conversationId);
      if (mobileOverlayConversationIdRef.current === conversationId) {
        closeMobileConversationOverlay();
      }
      invalidateFloatingChatAggregates(queryClient);
      emitChatNavUnreadRefresh();
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationDeleted, onConversationDeleted);
    return () => window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationDeleted, onConversationDeleted);
  }, [closeMobileConversationOverlay, closePanel, queryClient]);

  const setCompactProfileOpen = useCallback((conversationId: string, open: boolean) => {
    setCompactProfileOpenByConversationId((prev) => ({ ...prev, [conversationId]: open }));
  }, []);

  const toggleCompactProfile = useCallback((conversationId: string) => {
    setCompactProfileOpenByConversationId((prev) => {
      const next = !prev[conversationId];
      if (next) {
        setAppointmentPanelOpenByConversationId((ap) => ({ ...ap, [conversationId]: false }));
      }
      return { ...prev, [conversationId]: next };
    });
  }, []);

  const openAppointmentPanel = useCallback((conversationId: string) => {
    setAppointmentPanelOpenByConversationId((prev) => ({ ...prev, [conversationId]: true }));
    setCompactProfileOpenByConversationId((prev) => ({ ...prev, [conversationId]: false }));
  }, []);

  const closeAppointmentPanel = useCallback((conversationId: string) => {
    setAppointmentPanelOpenByConversationId((prev) => ({ ...prev, [conversationId]: false }));
  }, []);

  const value = useMemo<FloatingChatContextValue>(
    () => ({
      listOpen,
      setListOpen,
      toggleList,
      panels,
      activeWindowId,
      focusWindow,
      pulseUntil,
      openOrFocusConversation,
      minimizePanel,
      expandPanel,
      closePanel,
      closeFloatingConversation: closePanel,
      composerDrafts,
      setComposerDraft,
      instanceIds,
      instancesLoading,
      inboxScope,
      openConversationInContext,
      openChatForClient,
      openChatForLead,
      closeMobileConversationOverlay,
      compactProfileOpenByConversationId,
      toggleCompactProfile,
      setCompactProfileOpen,
      appointmentPanelOpenByConversationId,
      openAppointmentPanel,
      closeAppointmentPanel,
    }),
    [
      listOpen,
      toggleList,
      panels,
      activeWindowId,
      focusWindow,
      pulseUntil,
      openOrFocusConversation,
      minimizePanel,
      expandPanel,
      closePanel,
      composerDrafts,
      setComposerDraft,
      instanceIds,
      instancesLoading,
      inboxScope,
      openConversationInContext,
      openChatForClient,
      openChatForLead,
      closeMobileConversationOverlay,
      compactProfileOpenByConversationId,
      toggleCompactProfile,
      setCompactProfileOpen,
      appointmentPanelOpenByConversationId,
      openAppointmentPanel,
      closeAppointmentPanel,
    ],
  );

  return (
    <FloatingChatContext.Provider value={value}>
      {children}
      {mobileOverlayConversationId ? (
        <MobileConversationOverlay
          conversationId={mobileOverlayConversationId}
          onClose={closeMobileConversationOverlay}
        />
      ) : null}
    </FloatingChatContext.Provider>
  );
}
