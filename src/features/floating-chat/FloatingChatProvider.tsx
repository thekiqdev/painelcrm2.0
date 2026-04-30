import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { chatService } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { emitChatNavUnreadRefresh } from '@/lib/chatNavUnreadEvents';
import { FLOATING_CHAT_MAX_EXPANDED } from './constants';
import { isFloatingChatEscapeBlocked } from './floatingChatEscapeGuard';
import {
  loadFloatingChatPersisted,
  panelsToPersistedState,
  persistedStateToPanels,
  saveFloatingChatPersisted,
} from './persist';
import type { FloatingChatPanel } from './floatingChatTypes';

type FloatingChatContextValue = {
  listOpen: boolean;
  setListOpen: (v: boolean) => void;
  toggleList: () => void;
  panels: FloatingChatPanel[];
  activeWindowId: string | null;
  focusWindow: (conversationId: string) => void;
  /** epoch ms até quando mostrar pulse na pill minimizada */
  pulseUntil: Record<string, number>;
  openOrFocusConversation: (conversationId: string) => void;
  minimizePanel: (conversationId: string) => void;
  expandPanel: (conversationId: string) => void;
  closePanel: (conversationId: string) => void;
  /** Remove só do shell flutuante (não encerra atendimento). */
  closeFloatingConversation: (conversationId: string) => void;
  composerDrafts: Record<string, string>;
  setComposerDraft: (conversationId: string, text: string) => void;
  instanceIds: string[];
  inboxScope: 'tenant' | 'owner';
};

const FloatingChatContext = createContext<FloatingChatContextValue | null>(null);

function countExpanded(panels: FloatingChatPanel[]): number {
  return panels.filter((p) => !p.minimized).length;
}

const PERSIST_DEBOUNCE_MS = 160;

async function filterExistingConversationIds(ids: string[]): Promise<Set<string>> {
  const valid = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await chatService.getConversationProfile(id);
        valid.add(id);
      } catch {
        /* conversa inexistente ou sem acesso */
      }
    }),
  );
  return valid;
}

export function FloatingChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
  const [instanceIds, setInstanceIds] = useState<string[]>([]);

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
      return;
    }
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
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshInstances();
  }, [refreshInstances]);

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

  useEffect(() => {
    return () => {
      if (!persistEnabledRef.current) return;
      const { listOpen: lo, panels: ps, activeWindowId: aw } = latestPersistRef.current;
      saveFloatingChatPersisted(panelsToPersistedState(ps, aw, lo));
    };
  }, []);

  useEffect(() => {
    const onConvUpd = () => {
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
    };
    const onNotif = () => {
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
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
        emitChatNavUnreadRefresh();
        void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
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

  /** Validar IDs restaurados (não depende da lista de conversas já carregada). */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const current = panelsRef.current;
      const ids = [...new Set(current.map((p) => p.conversationId))];
      if (ids.length === 0) return;
      void (async () => {
        const valid = await filterExistingConversationIds(ids);
        if (cancelled) return;
        setPanels((prev) => {
          const next = prev.filter((p) => valid.has(p.conversationId));
          return next.length === prev.length ? prev : next;
        });
        setActiveWindowId((prev) => (prev && valid.has(prev) ? prev : null));
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [user?.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (isFloatingChatEscapeBlocked()) return;

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
      void chatService.markConversationRead(conversationId).then(() => {
        emitChatNavUnreadRefresh();
        void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
      });
    },
    [clearPulseFor, queryClient],
  );

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
      void chatService.markConversationRead(conversationId).then(() => {
        emitChatNavUnreadRefresh();
        void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
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
    setActiveWindowId((prev) => (prev === conversationId ? null : prev));
    clearPulseFor(conversationId);
  }, [clearPulseFor]);

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
      inboxScope,
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
      inboxScope,
    ],
  );

  return <FloatingChatContext.Provider value={value}>{children}</FloatingChatContext.Provider>;
}

export function useFloatingChat(): FloatingChatContextValue {
  const ctx = useContext(FloatingChatContext);
  if (!ctx) {
    throw new Error('useFloatingChat must be used within FloatingChatProvider');
  }
  return ctx;
}

export function useFloatingChatOptional(): FloatingChatContextValue | null {
  return useContext(FloatingChatContext);
}
